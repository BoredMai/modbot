var XPTracker;
(function (XPTracker) {
    var doc = new GoogleSpreadsheet(Sheets.XPSheet);
    var charSheet = null;
    var fMap = new Map();
    var pending = [];
    var XPToLevel = require('./imports/xptolevel.json');

    XPTracker.setup = setup;
    XPTracker.handle = handle;

    function setup(credentials) {
        return new Promise((resolve, reject) => {
            fMap.set('new', newChar);
            fMap.set('del', delChar);
            fMap.set('get', get);
            fMap.set('add', add);
            fMap.set('madd', madd);
            fMap.set('sub', subtract);
            fMap.set('subtract', subtract);
            fMap.set('pending', showPending);
            fMap.set('confirm', confirm);
            fMap.set('cancel', cancel);
            fMap.set('help', help);

            doc.useServiceAccountAuth(credentials, function (err) {
                if (err) {
                    reject(err);
                } else {
                    doc.getInfo(function(err, info) {
                        if (!err) {
                            charSheet = info.worksheets[0];
                            resolve();
                        } else {
                            reject(err);
                        }
                    });
                }
            });
        });
    }

    function handle(message) {
        var command = message.content.match(/\w+|"[^"]+"/g).slice(1);
        var f = fMap.get(command[0].toLowerCase());
        if (f)
            f(message, command.slice(1));
        else
            message.channel.send(message.content + ' - command failed');
    }

    function newChar(message, command) {
        if (command.length < 1) {
            message.channel.send('Please inform a character name.');
            return;
        }

        charSheet.getRows({
            offset: 1,
            query: 'patronname = ' + command[0]
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length > 0) {
                    message.channel.send('There is an existing character with this name. Please select a different name.');
                } else {
                    var row = {};
                    row['patronname'] = command[0].replace(/"/g, '');
                    row['currentlevel'] = command[1] ? command[1] : 12;
                    row['currentxp'] = 0;
                    row['xptilnextlvl'] = '=if(' + row['currentlevel'] + ' = 20, "N/A", VLOOKUP(' + row['currentlevel'] + ', \'XP Chart\'!$A$2:$C$21, 3) - ' + row['currentxp'] + ')';

                    charSheet.addRow(row, err => {
                        if (err) {
                            message.channel.send('Error executing command - check bot logs');
                            throwError(message, err);
                        } else {
                            message.channel.send('Character ' + row['patronname'] + ' created successfully.');
                        }
                    });
                }
            }
        });
    }

    function delChar(message, command) {
        if (command.length < 1) {
            message.channel.send('Please inform a character name.');
            return;
        }

        charSheet.getRows({
            offset: 1,
            query: 'patronname = ' + command[0]
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length > 0) {
                    var p = {};
                    p.row = rows[0];
                    p.exec = 'del';
                    pending.push(p);
                    message.channel.send('Exclusion of character ' + p.row['patronname'] + ' was added to pending list. Type "!modxp confirm" to save, or "!modxp cancel" to discard changes.');
                } else {
                    message.channel.send('There is no existing character with this name. Please select a different name.');
                }
            }
        });
    }

    function get(message, command) {
        charSheet.getRows({
            offset: 1
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                var matches = [];
                for (var row of rows) {
                    if (row['patronname'].toLowerCase().indexOf(command[0].toLowerCase().replace(/"/g, '')) !== -1) {
                        matches.push(row);
                    }
                }
                
                var msg = '';
                if (matches.length === 0) {
                    msg += 'No matches found for ' + command[0] + '. Run "!modxp new <charactername> <level>" to add a new character.';
                } else {
                    msg += matches.length + ' match(es) for ' + command[0];
                    for (var match of matches) {
                        msg += '\n' + match['patronname'] + ' | Level ' + match['currentlevel'] + ' | XP: ' + match['currentxp'] + ' | Next Level: ' + match['xptilnextlvl'];
                    }
                }
                message.channel.send(msg);
            }
        });
    }

    function add(message, command) {
        for (var p of pending) {
            if (p.row['patronname'].toLowerCase() === command[0].replace(/"/g, '').toLowerCase()) {
                message.channel.send('There are pending changes on the character named ' + command[0] + '. Please execute or discard them before making new changes.');
                return;
            }
        }

        if (isNaN(command[1])) {
            message.channel.send(command[1] + ' is not a valid XP amount.');
            return;
        }

        charSheet.getRows({
            offset: 1,
            query: 'patronname = ' + command[0]
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                var msg = '';
                if (rows.length > 0) {
                    msg += 'Updating character\n';
                    var match = rows[0];
                    msg += handleXP(match, parseInt(command[1]));
                    msg += 'Change added to pending list. Type "!modxp confirm" to save, or "!modxp cancel" to discard changes.';
                } else {
                    msg += 'No matches found for ' + command[0] + '. Run "!modxp new <charactername> <level>" to add a new character.';
                }
                message.channel.send(msg);
            }
        });
    }

    function madd(message, command) {
        if (isNaN(command[command.length - 1])) {
            message.channel.send(command[command.length - 1] + ' is not a valid XP amount.');
            return;
        }
        
        var charList = message.content.match(/\[.*\]/g)[0].toLowerCase().match(/\w+|"[^"]+"/g);
        var reject = [];
        
        for (var p of pending) {
            if ((charList.indexOf(p.row['patronname'].toLowerCase()) !== -1) ||
                (charList.indexOf('"' + p.row['patronname'].toLowerCase() + '"') !== -1)) {
                reject.push(p.row['patronname']);
            }
        }
        if (reject.length > 0) {
            var msg = 'There are pending changes on the following characters. Please execute or discard them before making new changes:\n';
            msg += reject.join('\n');
            message.channel.send(msg);
            return;
        } else {
            charSheet.getRows({
                offset: 1,
                query: 'patronname = ' + charList.join(' or patronname = ')
            }, function( err, rows ) {
                if (err) {
                    message.channel.send('Error executing command - check bot logs');
                    throwError(message, err);
                } else {
                    var msg = '';
                    if (rows.length > 0) {
                        msg += 'Updating character(s)\n';
                        var amount = parseInt(command[command.length - 1]);
                        for (var r of rows) {
                            msg += handleXP(r, amount);
                            var index = charList.indexOf(r['patronname'].toLowerCase()) !== -1 ?
                                        charList.indexOf(r['patronname'].toLowerCase()) :
                                        charList.indexOf('"' + r['patronname'].toLowerCase() + '"');
                            if (index !== -1) charList.splice(index, 1);
                        }
                        msg += 'Changes added to pending list. Type "!modxp confirm" to save, or "!modxp cancel" to discard changes.'
                        if (charList.length > 0) {
                            msg += '\nNo matches found for the following characters:\n';
                            msg += charList.join('\n');
                            msg += 'Run "!modxp new <charactername> <level>" to add a new character.';
                        }
                    } else {
                        msg += 'No matches found for the following characters:\n';
                        msg += charList.join('\n');
                        msg += 'Run "!modxp new <charactername> <level>" to add a new character.';
                    }
                    message.channel.send(msg);
                }
            });
        }
    }

    function subtract(message, command) {
        for (var p of pending) {
            if (p.row['patronname'].toLowerCase() === command[0].replace(/"/g, '').toLowerCase()) {
                message.channel.send('There are pending changes on the character named ' + command[0] + '. Please execute or discard them before making new changes.');
                return;
            }
        }

        if (isNaN(command[1])) {
            message.channel.send(command[1] + ' is not a valid XP amount.');
            return;
        }

        charSheet.getRows({
            offset: 1,
            query: 'patronname = ' + command[0]
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                var msg = '';
                if (rows.length > 0) {
                    msg += 'Updating character\n';
                    var match = rows[0];
                    var amount = -parseInt(command[1]);
                    msg += handleXP(match, amount);
                    msg += 'Change added to pending list. Type "!modxp confirm" to save, or "!modxp cancel" to discard changes.';
                } else {
                    msg += 'No matches found for ' + command[0] + '. Run "!modxp new <charactername> <level>" to add a new character.';
                }
                message.channel.send(msg);
            }
        });
    }

    function handleXP(char, amount) {
        var msg = '';
        var p = { prev: { currentlevel: char['currentlevel'], currentxp: char['currentxp']}, row: char, exec: 'save' };
                    
        msg += char['patronname'] + ' | Level ' + char['currentlevel'] + ' | XP: ' + char['currentxp'] + ' -> ';

        char['currentxp'] = parseInt(char['currentxp']) + amount;
        if (amount > 0) {
            while ((parseInt(char['currentlevel']) < 20) && (parseInt(char['currentxp']) >= XPToLevel[char['currentlevel']])) {
                var newxp = char['currentxp'] - XPToLevel[char['currentlevel']];
                char['currentlevel'] = parseInt(char['currentlevel']) + 1;
                // if (parseInt(char['currentlevel']) === 20) {
                //     char['currentxp'] = 'N/A';
                //     char['xptilnextlvl'] = 'N/A';
                // } else {
                //     char['currentxp'] = newxp;
                //     char['xptilnextlvl'] = XPToLevel[char['currentlevel']] - char['currentxp'];
                // }
                if (parseInt(char['currentlevel']) === 20) char['currentxp'] = 'N/A';
                else char['currentxp'] = newxp;
                msg += '[LEVEL UP!] ';
            }
        } else {
            while (parseInt(char['currentxp']) < 0) {
                char['currentlevel'] = parseInt(char['currentlevel']) - 1;
                if (parseInt(char['currentlevel']) === 0) {
                    char['currentlevel'] = 1;
                    char['currentxp'] = 0;
                } else {
                    char['currentxp'] = XPToLevel[char['currentlevel']] + parseInt(char['currentxp']);
                }
                msg += '[LEVEL DOWN¡] ';
            }
        }
        msg += 'Level ' + char['currentlevel'] + ' | XP: ' + char['currentxp'] + '\n';

        pending.push(p);
        return msg;
    }
    
    function showPending(message, command) {
        if (pending.length > 0) {
            var msg = '';
            msg += 'Updating character(s)';
            for (var p of pending) {
                if (p.exec === 'save') {
                    msg += '\n' + p.row['patronname'] + ' | Level ' + p.prev['currentlevel'] + ' | XP: ' + p.prev['currentxp'] + ' -> ';
                    msg += 'Level ' + p.row['currentlevel'] + ' | XP: ' + p.row['currentxp'];
                } else if (p.exec === 'del') {
                    msg += '\n' + p.row['patronname'] + ' | Level ' + p.row['currentlevel'] + ' | XP: ' + p.row['currentxp'] + ' -> ';
                    msg += '[DELETED]';
                }
            }
            message.channel.send(msg);
        } else {
            message.channel.send('No pending changes.');
        }
    }

    function confirm(message, command) {
        if (pending.length > 0) {
            var p = pending[0];
            if (p.exec === 'save') {
                p.row['xptilnextlvl'] = '=if(' + p.row['currentlevel'] + ' = 20, "N/A", VLOOKUP(' + p.row['currentlevel'] + ', \'XP Chart\'!$A$2:$C$21, 3) - ' + p.row['currentxp'] + ')';
                p.row.save(err => {
                    if (err) {
                        var msg = '';
                        msg += 'There was an error while saving the current row\n';
                        msg += p.row['patronname'] + ' | Level ' + p.prev['currentlevel'] + ' | XP: ' + p.prev['currentxp'] + ' -> ';
                        msg += 'Level ' + p.row['currentlevel'] + ' | XP: ' + p.row['currentxp'];
                        message.channel.send(msg);
                        throwError(message, err);
                    } else {
                        pending.shift();
                        if (pending.length === 0) {
                            message.channel.send('All changes saved.');
                        } else {
                            confirm(message, command);
                        }
                    }
                });
            }
            else if (p.exec === 'del') {
                p.row.del(err => {
                    if (err) {
                        var msg = '';
                        msg += 'There was an error while deleting the current row\n';
                        msg += p.row['patronname'] + ' | Level ' + p.row['currentlevel'] + ' | XP: ' + p.row['currentxp'];
                        message.channel.send(msg);
                        throwError(message, err);
                    } else {
                        pending.shift();
                        if (pending.length === 0) {
                            message.channel.send('All changes saved.');
                        } else {
                            confirm(message, command);
                        }
                    }
                });
            }
        } else {
            message.channel.send('No pending changes.');
        }
    }

    function cancel(message, command) {
        if (pending.length > 0) {
            if (command[0]) {
                if (command[0] === 'all') {
                    pending = [];
                    message.channel.send('Pending changes discarded.');
                } else {
                    var remove = null;
                    for (var p of pending) {
                        if (p.row['patronname'].toLowerCase() === command[0].replace(/"/g, '').toLowerCase()) {
                            remove = p;
                            break;
                        }
                    }
                    if (remove) {
                        pending.splice(pending.indexOf(remove), 1);
                        message.channel.send('Discarded changes on ' + command[0] + '.');
                    } else {
                        message.channel.send('There are no pending changes on ' + command[0] + '.');
                    }
                }
            } else {
                pending.pop();
                message.channel.send('Last change discarded.');
            }
        } else {
            message.channel.send('No pending changes.');
        }
    }

    function help(message, command) {
        message.channel.send(
            '**[IMPORTANT]** Use double quotes(") when using a character name with spaces!\n\n' +
            '**!modxp new <charactername> <level>** - Create a new character. If <level> isn\'t informed, character is created at level 12.\n' +
            '**!modxp del <charactername>** - Adds exclusion of a character to the pending list. Character name *must be a match*.\n' +
            '**!modxp get <charactername>** - Searches for a character in the database.\n' +
            '**!modxp add <charactername> <xp>** - Adds XP to a specific character and adds the change to the pending list. Character name *must be a match*.\n' +
            '**!modxp madd [<charactername>, <charactername>(...)] <xp>** - Adds XP to a list of characters and adds the change to the pending list. Character names *must be matches*.\n' +
            '**!modxp sub|subtract <charactername> <xp>** - Subtracts XP from a specific character and adds the change to the pending list. Character name *must be a match*.\n' +
            '**!modxp pending** - Lists all pending changes.\n' +
            '**!modxp confirm** - Executes all pending changes.\n' +
            '**!modxp cancel** - Discards last pending change.\n' +
            '**!modxp cancel all** - Discards all pending changes.\n' +
            '**!modxp cancel <charactername>** - Discards pending changes on the character informed.\n' +
            '**!modxp help** - Shows this help reference.\n'
        );
    }

    function throwError(message, err) {
        var d = new Date();
        console.log('[' + d.toDateString() + ' at ' + d.toTimeString() + ']');
        console.log('Commmand ' + message.content + ' from ' + message.author.username);
        console.log(err);
    }
})(XPTracker || (XPTracker = {}));