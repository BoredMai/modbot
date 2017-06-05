/*
  An initiative tracker
*/
const GoogleSpreadsheet = require('google-spreadsheet');
const Discord = require('discord.js');
const token = require('./token.js');
const Sheets = require('./sheets.js');
const credentials = require('./credentials.json');
const modbot = new Discord.Client();
const version = '1.0.0';


modbot.on('ready', () => {
  XPTracker.setup(credentials).then(err => {
    if (err) {
      console.log('[ERROR] ' + err);
    } else {
      console.log('Modbot ' + version + ' up and running');
    }

  });
});

modbot.on('message', message => {
  if (message.author.id !== modbot.user.id) {
    if (message.content.indexOf('!modxp') === 0) XPTracker.handle(message);
    if (message.content.indexOf('!modbot') === 0) message.channel.send('Modbot ' + version + ' up and running');
  }
});

modbot.login(token);
var XPTracker;
(function (XPTracker) {
    var doc = new GoogleSpreadsheet(Sheets.XPSheet);
    var charSheet = null;
    var xpSheet = null;
    var fMap = new Map();
    var pending = [];

    XPTracker.setup = setup;
    XPTracker.handle = handle;

    function setup(credentials) {
        return new Promise((resolve, reject) => {
            fMap.set('new', newChar);
            fMap.set('get', get);
            fMap.set('add', add);
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
                            xpSheet = info.worksheets[1];
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
        charSheet.getRows({
            offset: 1,
            query: 'patronname = ' + command[0]
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if ((command.length > 1) && (isNaN(command[1]))) {
                    message.channel.send(command[1] + ' is not a valid XP amount.');
                    return;
                }

                var msg = '';
                if (rows.length > 0) {
                    var match = rows[0];
                    var p = { prev: { currentlevel: match['currentlevel'], currentxp: match['currentxp']}, row: match, exec: 'save' };
                    
                    msg += 'Updating character\n';
                    msg += match['patronname'] + ' | Level ' + match['currentlevel'] + ' | XP: ' + match['currentxp'] + ' -> ';

                    if (parseInt(command[1]) >= parseInt(match['xptilnextlvl'])) {
                        match['currentlevel'] = parseInt(match['currentlevel']) + 1;
                        match['currentxp'] = parseInt(match['currentlevel']) === 20 ? 'N/A' : parseInt(command[1]) - parseInt(match['xptilnextlvl']);
                        msg += '[LEVEL UP!] ';
                    } else {
                        match['currentxp'] = parseInt(match['currentxp']) + parseInt(command[1]);
                    }
                    msg += 'Level ' + match['currentlevel'] + ' | XP: ' + match['currentxp'];
                    msg += '\nChange added to pending list. Type "!modxp confirm" to save, or "!modxp cancel" to discard changes.'

                    pending.push(p);
                } else {
                    msg += 'No matches found for ' + command[0] + '. Run "!modxp new <charactername> <level>" to add a new character.';
                }
                message.channel.send(msg);
            }
        });
    }
    
    function showPending(message, command) {
        if (pending.length > 0) {
            var msg = '';
            msg += 'Updating character(s)';
            for (var p of pending) {
                msg += '\n' + p.row['patronname'] + ' | Level ' + p.prev['currentlevel'] + ' | XP: ' + p.prev['currentxp'] + ' -> ';
                msg += 'Level ' + p.row['currentlevel'] + ' | XP: ' + p.row['currentxp'];
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
            if ((command[0]) && (command[0] === 'all')) {
                pending = [];
                message.channel.send('Pending changes discarded.');
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
            '**[IMPORTANT]** Use double quotes(") when using a character name with spaces!\n' +
            '**!modxp new <charactername> <level>** - Create a new character. If <level> isn\'t informed, character is created at level 12.\n' +
            '**!modxp get <charactername>** - Searches for a character in the database.\n' +
            '**!modxp add <charactername> <xp>** - Adds XP to a specific character and adds the change to a pending list. Character name *must be a match*.\n' +
            '**!modxp pending** - Lists all pending changes.\n' +
            '**!modxp confirm** - Executes all pending changes.\n' +
            '**!modxp cancel** - Discards last pending change.\n' +
            '**!modxp cancel all** - Discards all pending changes.\n' +
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