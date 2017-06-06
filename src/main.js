/*
  An initiative tracker
*/
const GoogleSpreadsheet = require('google-spreadsheet');
const Discord = require('discord.js');
const token = require('./imports/token.js');
const Sheets = require('./imports/sheets.js');
const credentials = require('./imports/credentials.json');
const modbot = new Discord.Client();
const version = '1.0.0';

var loaded = false;

modbot.on('ready', () => {
  XPTracker.setup(credentials).then(err => {
    if (err) {
      console.log('[ERROR] ' + err);
    } else {
      loaded = true;
      console.log('Modbot ' + version + ' up and running');
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
    if (message.content.toLowerCase().indexOf('!modxp') === 0) XPTracker.handle(message);
  }
});

function showHelp (message) {
  var msg = '';
  if (loaded) {
    msg += 'Modbot ' + version + ' up and running';
    msg += '\nUse **!modxp help** to get information on the XP Tracker Module.';
  } else {
    msg += 'Modbot ' + version + ' connecting to database. If it takes too long, contact ' + modbot.users.get('168418053028052993') + '.';
  }
  message.channel.send(msg);
}

modbot.login(token);