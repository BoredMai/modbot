var QuestTracker;
(function (QuestTracker) {
    var doc = new GoogleSpreadsheet(Sheets.QuestSheet);
    var questSheet = null;
    var fMap = new Map();
    var pending = [];

    QuestTracker.setup = setup;
    QuestTracker.handle = handle;
    QuestTracker.loaded = false;

    function setup(credentials) {
        return new Promise((resolve, reject) => {
            fMap.set('l', list);
            fMap.set('list', list);
            fMap.set('new', newQuest);
            fMap.set('thread', setThread);
            fMap.set('add', addParticipants);
            fMap.set('del', deleteParticipants);
            fMap.set('take', take);
            fMap.set('leave', leave);
            fMap.set('s', schedule);
            fMap.set('schedule', schedule);
            fMap.set('us', unschedule);
            fMap.set('unschedule', unschedule);
            fMap.set('open', open);
            fMap.set('start', start);
            fMap.set('complete', complete);
            fMap.set('drop', drop);
            // fMap.set('cancel', cancel);
            fMap.set('help', help);

            doc.useServiceAccountAuth(credentials, function (err) {
                if (err) {
                    reject(err);
                } else {
                    doc.getInfo(function(err, info) {
                        if (!err) {
                            questSheet = info.worksheets[0];
                            QuestTracker.loaded = true;
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
        var command = message.content.match(/\w+|"[^"]+"|\[.*\]/g).slice(1);
        var f = fMap.get(command[0].toLowerCase());
        if (f)
            f(message, command.slice(1));
        else
            message.channel.send(message.content + ' - command failed');
    }

    function list(message, command) {
        var query = '';
        if (command.length > 0) {
            switch (command[0].toLowerCase()) {
                case 'o':
                case 'open':
                    query = 'status = Open';
                    break;
                case 's':
                case 'scheduled':
                    query = 'status = Scheduled';
                    break;
                case 'p':
                case 'progress':
                    query = 'status = "In Progress"';
                    break;
                case 'c':
                case 'completed':
                    query = 'status = Completed';
                    break;
                case 'd':
                case 'dropped':
                    query = 'status = Dropped';
                    break;
                case 'a':
                case 'assigned':
                    query = 'dm != ""';
                    break;
                case 'u':
                case 'unassigned':
                    query = 'dm = ""';
                    break;
            }
        }

        console.log('query', query);
        questSheet.getRows({
            offset: 1,
            orderby: 'id',
            query: query
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('No quests/explorations found with the current filter: ' + command[0] + '.');
                } else {
                    var msg = '';
                    for (var r of rows) {
                        msg += '**[QID ' + r['qid'] + ']';
                        msg += r['type'] + ' ' + r['name'] + '**';
                        msg += '\nParticipants: ' + r['participants'];
                        msg += '\nThread: <' + r['thread'] + '>';
                        msg += '\nStatus: ' + r['status'];
                        if (r['status'] === 'Scheduled') {
                            msg += ' at ' + r['when'];
                        }
                        var dm = r['dm'].slice(0, r['dm'].indexOf('<') - 1);
                        msg += '\nDM: ' + dm;
                        msg += '\n\n';
                    }

                    message.channel.send(msg);
                }
            }
        });
    }

    function newQuest(message, command) {
        if (command.length < 2) {
            message.channel.send('You need to specify at least quest type and name.');
            return;
        }

        var quest = {};
        var d = new Date();
        quest['addedon'] = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
        quest['status'] = 'Open';

        if (command[0] === 'q' || command[0] === 'quest') quest['type'] = 'Quest';
        if (command[0] === 'e' || command[0] === 'exploration') quest['type'] = 'Exploration';

        if (!quest.type) {
            message.channel.send('Invalid quest type. Use q|quest or e|exploration.');
            return;
        }

        quest['name'] = command[1].replace(/"/g, '');


        if (command[2]) quest['participants'] = command[2].replace(/[\[\]]/g, '').replace(/,(?![ ])/g, ', ');

        if (command[3]) quest['thread'] = message.content.slice(message.content.indexOf('http'));

        questSheet.getRows({
            offset: 1,
            limit: 1,
            reverse: true,
            orderby: 'qid'
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length > 0) quest['qid'] = parseInt(rows[0]['qid']) + 1;
                else quest['qid'] = 1;

                questSheet.addRow(quest, err => {
                    if (err) {
                        message.channel.send('Error executing command - check bot logs');
                        throwError(message, err);
                    } else {
                        message.channel.send(quest['type'] + ' ' + quest['name'] + ' created successfully with QID ' + quest['qid'] + '.');
                    }
                });
            }
        });
    }

    function setThread(message, command) {
        if (command.length < 2) {
            message.channel.send('You need give both QID and thread.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    console.log(command[1]);
                    rows[0]['thread'] = message.content.slice(message.content.indexOf('http'));
                    rows[0].save(err => {
                        if (err) {
                            message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                            throwError(message, err);
                        } else {
                            message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - thread updated.');
                        }
                    });
                }
            }
        });
    }

    function addParticipants(message, command) {
        if (command.length < 2) {
            message.channel.send('You need give both QID and participant(s) to add.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    var newP = command[1].replace(/[\[\]"]/g, '').replace(/,(?![ ])/g, ', ').split(', ');
                    if (rows[0]['participants'] !== '') {
                        var oldP = rows[0]['participants'].split(', ');
                        for (var p of oldP) {
                            if (newP.indexOf(p) !== -1) {
                                newP.splice(newP.indexOf(p), 1);
                            }   
                        }
                        newP.unshift('');
                    }
                    rows[0].participants += newP.join(', ');
                    rows[0].save(err => {
                        if (err) {
                            message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                            throwError(message, err);
                        } else {
                            message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - participants added.');
                        }
                    });
                }
            }
        });
    }

    function deleteParticipants(message, command) {
        if (command.length < 2) {
            message.channel.send('You need give both QID and participant(s) to remove.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    var delP = command[1].replace(/[\[\]"]/g, '').replace(/,(?![ ])/g, ', ').split(', ');
                    if (rows[0]['participants'] === '') {
                        message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - no participants added yet.');
                        
                    } else {
                        var oldP = rows[0]['participants'].split(', ');
                        for (var p of delP) {
                            if (oldP.indexOf(p) !== -1) {
                                oldP.splice(oldP.indexOf(p), 1);
                            }   
                        }
                    }
                    rows[0].participants = oldP.join(', ');
                    rows[0].save(err => {
                        if (err) {
                            message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                            throwError(message, err);
                        } else {
                            message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - participants removed.');
                        }
                    });
                }
            }
        });
    }

    function take(message, command) {
        if (command.length < 1) {
            message.channel.send('You need give a QID for the quest you want to take.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    if (rows[0]['dm'] === '') {
                        var dm = message.channel.guild.member(message.author).nickname;
                        rows[0]['dm'] = dm + '\n' + message.author;
                        rows[0].save(err => {
                            if (err) {
                                message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                                throwError(message, err);
                            } else {
                                message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - taken by ' + dm + '.');
                            }
                        });
                    } else {
                        var dm = rows[0]['dm'].slice(0, rows[0]['dm'].indexOf('<') - 1);
                        message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - already taken by ' + dm + '.');
                    }
                }
            }
        });
    }

    function leave(message, command) {
        if (command.length < 1) {
            message.channel.send('You need give a QID for the quest you want to leave.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    if (rows[0]['dm'] === '') {
                        message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - has not been taken yet.');
                    } else {
                        var dm = rows[0]['dm'].slice(rows[0]['dm'].indexOf('<'));
                        dm = dm.replace(/[<@>]/g, '');
                        if (message.author.id === dm) {
                            rows[0]['dm'] = '';
                            rows[0].save(err => {
                                if (err) {
                                    message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                                    throwError(message, err);
                                } else {
                                    message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - left successfully.');
                                }
                            });
                        } else {
                            message.channel.send('You cannot leave a quest you\'re not assigned to.');
                        }
                    }
                }
            }
        });
    }

    function schedule(message, command) {
        if (command.length < 2) {
            message.channel.send('You need give both QID and a schedule.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    if (rows[0]['dm'] === '') {
                        message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - cannot schedule an unassigned ' + rows[0]['type'].toLowerCase() + '.');
                    } else {
                        rows[0]['status'] = 'Scheduled';
                        rows[0]['when'] = command[1].replace(/"/g, '');
                        rows[0].save(err => {
                            if (err) {
                                message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                                throwError(message, err);
                            } else {
                                message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - scheduled successfully.');
                            }
                        });
                    }
                }
            }
        });
    }

    function unschedule(message, command) {
        if (command.length < 1) {
            message.channel.send('You need give a QID to unschedule.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    if (rows[0]['schedule'] === '') {
                        message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - cannot unschedule the unscheduled.');
                    } else {
                        rows[0]['status'] = 'Open';
                        rows[0]['when'] = '';
                        rows[0].save(err => {
                            if (err) {
                                message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                                throwError(message, err);
                            } else {
                                message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - unscheduled successfully.');
                            }
                        });
                    }
                }
            }
        });
    }

    function open(message, command) {
        if (command.length < 1) {
            message.channel.send('You need give a QID to reopen a quest/exploration.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    rows[0]['status'] = 'Open';
                    rows[0].save(err => {
                        if (err) {
                            message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                            throwError(message, err);
                        } else {
                            message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - status updated to "Open".');
                        }
                    });
                }
            }
        });
    }

    function start(message, command) {
        if (command.length < 1) {
            message.channel.send('You need give a QID to start a quest/exploration.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    if (rows[0]['dm'] === '') {
                        message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - cannot start an unassigned ' + rows[0]['type'].toLowerCase() + '.');
                    } else {
                        rows[0]['status'] = 'In Progress';
                        rows[0].save(err => {
                            if (err) {
                                message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                                throwError(message, err);
                            } else {
                                message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - status updated to "In Progress".');
                            }
                        });
                    }
                }
            }
        });
    }

    function complete(message, command) {
        if (command.length < 1) {
            message.channel.send('You need give a QID to complete a quest/exploration.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    if (rows[0]['dm'] === '') {
                        message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - cannot complete an unassigned ' + rows[0]['type'].toLowerCase() + '.');
                    } else {
                        rows[0]['status'] = 'Completed';
                        rows[0].save(err => {
                            if (err) {
                                message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                                throwError(message, err);
                            } else {
                                message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - status updated to "Completed".');
                            }
                        });
                    }
                }
            }
        });
    }

    function drop(message, command) {
        if (command.length < 1) {
            message.channel.send('You need give a QID to drop a quest/exploration.');
            return;
        }
        questSheet.getRows({
            offset: 1,
            query: 'qid = ' + command[0].toString()
        }, function( err, rows ) {
            if (err) {
                message.channel.send('Error executing command - check bot logs');
                throwError(message, err);
            } else {
                if (rows.length === 0) {
                    message.channel.send('Could not find a quest with QID ' + command[0] + '.');
                } else {
                    rows[0]['status'] = 'Dropped';
                    rows[0].save(err => {
                        if (err) {
                            message.channel.send('There was an error while executing your command. Please try again in a few moments.');
                            throwError(message, err);
                        } else {
                            message.channel.send('[QID ' + rows[0]['qid'] + ']' + rows[0]['type'] + ' ' + rows[0]['name'] + ' - status updated to "Dropped".');
                        }
                    });
                }
            }
        });
    }

    function help(message, command) {
        message.channel.send(
            '**[IMPORTANT]** Use double quotes(") when using names with spaces!\n\n' +
            '**!modq l|list** - List all quests and explorations.\n' +
            '**!modq l|list <param>** - List quests and explorations based on parameter: o|open, s|scheduled, p|progress, c|completed, d|dropped, a|assigned, u|unassigned\n' +
            '**!modq new <type> <quest> <participants> <thread>** - Create a new quest. Type can be q|quest or e|exploration. Participants and thread are optional on creation.\n' +
            '**!modq thread <qid> <thread>** - Add a thread to an existing quest/exploration.\n' +
            '**!modq add <qid> <participants>** - Add participants to an existing quest/exploration.\n' +
            '**!modq del <qid> <participants>** - Remove participants from an existing quest/exploration.\n' +
            '**!modq take <qid>** - Assign quest/exploration to self.\n' +
            '**!modq leave <qid>** - Unassign quest/exploration from self.\n' +
            '**!modq s|schedule <qid> <schedule>** - Schedule quest/exploration assigned to self.\n' +
            '**!modq us|unschedule <qid>** - Unassign quest/exploration from self.\n' +
            '**!modq open <qid>** - Change quest/exploration status to "Open".\n' +
            '**!modq start <qid>** - Change quest/exploration status to "In Progress".\n' +
            '**!modq complete <qid>** - Change quest/exploration status to "Completed".\n' +
            '**!modq drop <qid>** - Change quest/exploration status to "Dropped".\n'
        );
    }

    function throwError(message, err) {
        var d = new Date();
        console.log('[' + d.toDateString() + ' at ' + d.toTimeString() + ']');
        console.log('Commmand ' + message.content + ' from ' + message.author.username);
        console.log(err);
    }
})(QuestTracker || (QuestTracker = {}));