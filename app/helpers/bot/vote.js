const Promise = require('bluebird')
const steem = require('steem')
const sc2 = Promise.promisifyAll(require('sc2-sdk'))
const { user, wif, sc2_secret, steemit_url, grumpy, blacklisted } = require('../../config')
const schedule = require('node-schedule')
const Sequelize = require('sequelize')
const rp = require('request-promise');
const moment = require('moment');

steem.api.setWebSocket(steemit_url)

const MINUTE = new schedule.RecurrenceRule();
MINUTE.second = 1

const SECONDS_PER_HOUR = 3600
const PERCENT_PER_DAY = 20
const HOURS_PER_DAY = 24
const MAX_VOTING_POWER = 10000
const DAYS_TO_100_PERCENT = 100 / PERCENT_PER_DAY
const SECONDS_FOR_100_PERCENT = DAYS_TO_100_PERCENT * HOURS_PER_DAY * SECONDS_PER_HOUR
const RECOVERY_RATE = MAX_VOTING_POWER / SECONDS_FOR_100_PERCENT
const DEFAULT_THRESHOLD = 9000


function fetch_access_token(resister) {
    return rp({
        method: "POST",
        uri: "https://v2.steemconnect.com/api/oauth2/token",
        body: {
          refresh_token: resister.refreshToken,
          client_id: "we-resist",
          client_secret: sc2_secret,
          scope: "vote,comment,offline"
        },
        json: true
      })
}

function current_voting_power(vp_last, last_vote) {
    console.log("Comparing %s to %s ", moment().utc().add(7, 'hours').local().toISOString(), moment(last_vote).utc().local().toISOString())

    var seconds_since_vote = moment().utc().add(7, 'hours').local().diff(moment(last_vote).utc().local(), 'seconds')
    return (RECOVERY_RATE * seconds_since_vote) + vp_last
}

function time_needed_to_recover(voting_power, threshold) {
    return (threshold - voting_power) / RECOVERY_RATE
}

function check_can_vote(resister) {
    return steem.api.getAccountsAsync([ resister.username ]).then((accounts) => {
        if (accounts && accounts.length > 0) {
            const account = accounts[0];
            console.log("Getting voting power for %d %s", account.voting_power, account.last_vote_time)
            var voting_power = current_voting_power(account.voting_power, account.last_vote_time)
            if (voting_power > resister.threshold) {
                return true;
            }
        }
        return false;
    })
}

function vote(author, permlink, resister, weight) {
    const api = sc2.Initialize({
        app: 'we-resist',
        callbackURL: 'https://we-resist-bot.herokuapp.com/',
        accessToken: '',
        scope: ['vote', 'comment', 'offline']
    })

    if (resister.refreshToken) {
        return fetch_access_token(resister)
            .then((data) => {
                api.setAccessToken(data.access_token)
                return new Promise((resolve, reject) => {
                    api.vote(
                        resister.username,
                        author,
                        permlink,
                        weight,
                        function(err, results) {
                            if (err) {
                                return reject(err);
                            }
                            return resolve(results);
                        }
                    )
                })
                .then((results) => {
                    api.setAccessToken('')
                })
            })
            .catch((exception) => {
                console.log("Unable to vote for ", resister.username, exception.message)
                console.log("Error ", exception.error_description)
            })
    }
    return steem.broadcast.voteAsync(
        resister.wif, 
        resister.username, 
        author,
        permlink,
        weight
    )
    .then((results) =>  {
        console.log("Vote results: ", results)
        return results;
    },
    (err) => {
        console.log("Vote failed for %s: %s", resister.username, err.message)
    })
}

function execute(voting) {
    schedule.scheduleJob(MINUTE, function() {
        const api = sc2.Initialize({
            app: 'we-resist',
            callbackURL: 'https://we-resist-bot.herokuapp.com/',
            accessToken: '',
            scope: ['vote', 'comment', 'offline']
        })

        if (voting.length() < 1) {
            return {};
        }
               
        const { author, permlink, resister, weight } = voting.shift();

        return check_can_vote(resister).then((can_vote) => {
            if (can_vote) {
                console.log("Voting for ", resister.username)
                vote(author, permlink, resister, weight)
            }
            else {
                voting.push({ author, permlink, resister, weight })
            }
        })
    })
}

module.exports = {
    execute
}
