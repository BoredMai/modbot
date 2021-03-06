/*
  An initiative tracker
*/
const GoogleSpreadsheet = require('google-spreadsheet');
const Discord = require('discord.js');
const token = require('./imports/token.js');
const Sheets = require('./imports/sheets.js');
const credentials = require('./imports/credentials.json');
const modbot = new Discord.Client();
const version = '1.2.5';

modbot.on('ready', () => {
  XPTracker.setup(credentials).then(err => {
    if (err) {
      console.log('[ERROR] ' + err);
    } else {
      console.log('ModXP ' + version + ' up and running');
    }
  });
  QuestTracker.setup(credentials).then(err => {
    if (err) {
      console.log('[ERROR] ' + err);
    } else {
      console.log('ModQuest ' + version + ' up and running');
    }
  });
});

modbot.on('message', message => {
  if (message.author.id !== modbot.user.id) {
    if (message.channel.type === 'dm') {
      message.channel.send('ModBot does not accept direct messages.');
      return;
    }
    if (message.content.toLowerCase().indexOf('!modbot') === 0) showHelp(message);
    if (message.content.toLowerCase().indexOf('!modxp') === 0) {
      if (XPTracker.loaded) XPTracker.handle(message);
      else message.channel.send('ModXP connecting to database. If it takes too long, contact ' + modbot.users.get('168418053028052993') + '.');
    }
    if (message.content.toLowerCase().indexOf('!modq') === 0) {
      if (QuestTracker.loaded) QuestTracker.handle(message);
      else message.channel.send('ModQuest connecting to database. If it takes too long, contact ' + modbot.users.get('168418053028052993') + '.');
    }
  }
});

function showHelp (message) {
  var msg = 'Modbot ' + version + ' up and running';

  if (XPTracker.loaded) msg += '\nUse **!modxp help** to get information on the XP Tracker Module.';
  else msg += '\nModXP connecting to database. If it takes too long, contact ' + modbot.users.get('168418053028052993') + '.';
  
  if (QuestTracker.loaded) msg += '\nUse **!modq help** to get information on the Quest Tracker Module.';
  else msg += '\nModQuest connecting to database. If it takes too long, contact ' + modbot.users.get('168418053028052993') + '.';
  message.channel.send(msg);
}

modbot.login(token);
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
var XPTracker;
(function (XPTracker) {
    var doc = new GoogleSpreadsheet(Sheets.XPSheet);
    var charSheet = null;
    var fMap = new Map();
    var pending = [];
    var XPToLevel = require('./imports/xptolevel.json');

    XPTracker.setup = setup;
    XPTracker.handle = handle;
    XPTracker.loaded = false;

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
                            XPTracker.loaded = true;
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
        
        var charList = command[0].toLowerCase().match(/\w+|"[^"]+"/g);
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
                            msg += '\nRun "!modxp new <charactername> <level>" to add a new character.';
                        }
                    } else {
                        msg += 'No matches found for the following characters:\n';
                        msg += charList.join('\n');
                        msg += '\nRun "!modxp new <charactername> <level>" to add a new character.';
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