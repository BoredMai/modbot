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