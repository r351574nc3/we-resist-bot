const Promise = require('bluebird')
const steem = require('steem')
const sc2 = Promise.promisifyAll(require('sc2-sdk'))
const { user, wif, sc2_secret, steemit_url, grumpy, blacklisted } = require('../../config')
const schedule = require('node-schedule')
const Sequelize = require('sequelize')
const Handlebars = require('handlebars')
const fs = Promise.promisifyAll(require('fs'))
const path = require('path')

steem.api.setWebSocket(steemit_url)

const MINUTE = new schedule.RecurrenceRule();
MINUTE.second = 1

function loadTemplate(template) {
    return fs.readFileAsync(template, 'utf8')
}


function execute(comments) {
    schedule.scheduleJob(MINUTE, function() {
        const api = sc2.Initialize({
            app: 'we-resist',
            callbackURL: 'https://we-resist-bot.herokuapp.com/',
            accessToken: '',
            scope: ['vote', 'comment', 'offline']
        })

        if (comments.length() < 1) {
            return {};
        }

        const { author, permlink, type } = comments.shift();

        var context = {
        }
    
        return loadTemplate(path.join(__dirname, '..', 'templates', `${type}.hb`))
            .then((template) => {
                var templateSpec = Handlebars.compile(template)
                return templateSpec(context)
            })
            .then((message) => {
                var new_permlink = 're-' + author 
                    + '-' + permlink 
                    + '-' + new Date().toISOString().replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
                console.log("Commenting on ", author, permlink, type)

                return steem.broadcast.commentAsync(
                    wif,
                    author, // Leave parent author empty
                    permlink, // Main tag
                    user, // Author
                    new_permlink, // Permlink
                    new_permlink,
                    message, // Body
                    { tags: [], app: 'we-resist-bot/0.1.0' }
                ).then((results) => {
                    console.log(results)
                    return results
                })
                .catch((err) => {
                    console.log("Error ", err.message)
                })
            })
    })
}

module.exports = {
    execute
}
    