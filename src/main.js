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