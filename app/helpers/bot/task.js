'use strict'

const Promise = require('bluebird')
const steem = require('steem')
const sc2 = Promise.promisifyAll(require('sc2-sdk'))
const { user, wif, sc2_secret, steemit_url, grumpy, blacklisted } = require('../../config')
const moment = require('moment')
const schedule = require('node-schedule')
const Sequelize = require('sequelize')
const models = require('../../../models')
const Op = Sequelize.Op;
const Handlebars = require('handlebars')
const fs = Promise.promisifyAll(require('fs'))
const path = require('path')
const rp = require('request-promise');


const UNVOTE_WEIGHT = 0

module.exports = {
    execute
}

let VOTING = {};
let COMMENTS = {};

const SECONDS_PER_HOUR = 3600
const PERCENT_PER_DAY = 20
const HOURS_PER_DAY = 24
const MAX_VOTING_POWER = 10000
const DAYS_TO_100_PERCENT = 100 / PERCENT_PER_DAY
const SECONDS_FOR_100_PERCENT = DAYS_TO_100_PERCENT * HOURS_PER_DAY * SECONDS_PER_HOUR
const RECOVERY_RATE = MAX_VOTING_POWER / SECONDS_FOR_100_PERCENT
const DEFAULT_THRESHOLD = 9000

const api = sc2.Initialize({
    app: 'we-resist',
    callbackURL: 'https://we-resist-bot.herokuapp.com/',
    accessToken: '',
    scope: ['vote', 'comment', 'offline']
  })

steem.api.setWebSocket(steemit_url)

let heartbeat = moment();
let counter = 0

function current_voting_power(vp_last, last_vote) {
    console.log("Comparing %s to %s ", moment().utc().add(7, 'hours').local().toISOString(), moment(last_vote).utc().local().toISOString())

    var seconds_since_vote = moment().utc().add(7, 'hours').local().diff(moment(last_vote).utc().local(), 'seconds')
    return (RECOVERY_RATE * seconds_since_vote) + vp_last
}

function time_needed_to_recover(voting_power, threshold) {
    return (threshold - voting_power) / RECOVERY_RATE
}

// Stubbed function
function list_of_grumpy_users() {
    return grumpy;
}

// Stubbed function
function list_of_blacklisted_users() {
    return blacklisted;
}

class Vote {
    constructor(vote_json) {
        this.voter = vote_json.voter
        this.author = vote_json.author
        this.permlink = vote_json.permlink
        this.weight = vote_json.weight
    }

    is_downvote() {
        return !this.is_upvote()
    }

    is_upvote() {
        return this.weight > 0
    }

    is_downvote_worthy() {
        return this.weight > 300;
    }

    is_voter_grumpy() {
        // console.log("Comparing voter %s to %s", vote.voter, "grumpycat")
        return list_of_grumpy_users().filter((user) => user == this.voter).length > 0;
    }

    is_author_grumpy() {
        return list_of_grumpy_users().filter((user) => this.author == user).length > 0
    }

    is_author_blacklisted() {
        return list_of_blacklisted_users().filter((user) => this.author == user).length > 0
    }

    is_for_resister() {
        return list_of_resisters()
            .filter((resister) => this.author == resister.username)
            .then((resisters) => { return resisters.length > 0 })
    }
}

function processVote(vote) {

    if (!vote.is_voter_grumpy()) {
        return new Promise((resolve, reject) => {
            resolve(false)
        })
    }

    console.log("processing vote ", vote);

    if (vote.is_upvote() && vote.is_downvote_worthy()) {
        return processUpvote(vote)
    }

    return vote.is_for_resister()
        .then((it_is) => {
            if (it_is) {
                return processDownvote(vote)
            }
            return invite(vote.author, vote.permlink);
        })
}

function resister_has_token(resister) {
    return steem.api.getAccountsAsync([ resister.username ])
        .filter((account) => account.posting.account_auths.filter((auth) => auth[0] == 'we-resist').length > 0)
        .then((accounts) => accounts.length > 0)
}

/**
 * Resisters look like
 * {
 *  name: firedream,
 *  upvoteWeight: 10000,
 *  downvoteWeight: -10000,
 *  active: true,
 *  wif: wif
 * }
 */
function list_of_resisters() {
    return models.Preferences.findAll( {
        attributes: [ 'username', 'wif', 'upvoteWeight', 'downvoteWeight', 'threshold', 'refreshToken' ],
        logging: (query) => {}
    }).filter((user) => resister_has_token(user))
}

function processDownvote(vote) {
    return new Promise((resolve, reject) => {
        if (!vote.is_author_blacklisted()) { // Ignore blacklisted users
            console.log('Processing vote ', vote)
            return collectiveUpvote(vote.author, vote.permlink)
        }
    })
}

function processUpvote(vote) {
    return new Promise((resolve, reject) => {
        if (vote.is_author_grumpy()) {
            console.log("Downvoting ", vote)
            return collectiveDownvote(vote.author, vote.permlink)
        }

        // Not a self-vote
        return reject("Not a self vote")
    })
    .catch((err) => {
        console.log(err)
    })
}

function processUnvote(vote) {
    if (!vote.is_voter_grumpy()) {
        return false
    }

    return collectiveUnvote(author, permlink)
}

function invite(author, permlink) {
    return is_already_replied_to(author, permlink)
        .then((found) => {
            if (!found) {
                return reply(author, permlink, "invite")
            }
            return found;
        });
}

function is_already_replied_to(author, permlink) {
    return steem.api.getContentRepliesAsync(author, permlink)
        .filter((reply) => user == reply.author)
        .then((replies) => { return replies.length > 0 })
}


function reply(author, permlink, type) {
    COMMENTS.push({ author: author, permlink: permlink, type: type })
}

function downvote(author, permlink, resister) {
    vote(author, permlink, resister, resister.downvoteWeight * -100)
    return is_already_replied_to(author, permlink) 
        .then((found) => { 
            if (!found) {
                return reply(author, permlink, "downvote") 
            }   
            return found;
        });
}

function upvote(author, permlink, resister) {
    var recovery_wait = 0
    vote(author, permlink, resister, resister.upvoteWeight * 100)
    return is_already_replied_to(author, permlink)
        .then((found) => {
            if (!found) { // we we haven't replied yet
                return reply(author, permlink, "upvote") 
            }
            return found;
        });
}

function unvote(author, permlink, resister) {
    vote(author, permlink, resister, UNVOTE_WEIGHT)
}

function vote(author, permlink, resister, weight) {
    VOTING.push({ author: author, permlink: permlink, resister: resister, weight: weight })
}

function collectiveDownvote(author, permlink) {
    return list_of_resisters().each((resister) => { return downvote(author, permlink, resister) })
}

function collectiveUpvote(author, permlink) {
    return list_of_resisters().each((resister) => { return upvote(author, permlink, resister) })
}

function collectiveUnvote(author, permlink) {
    return list_of_resisters().each((resister) => { return unvote(author, permlink, resister) })
}

function processComment(comment) {
    return list_of_resisters()
        .filter((resister) => comment.author == resister.username &&
                               comment.author != "the-resistance")
        .each((resister) => {
            console.log("Processing comment ", comment);
            var recovery_wait = 0
            return steem.api.getAccountsAsync([ user ]).then((accounts) => {
                if (accounts && accounts.length > 0) {
                    const account = accounts[0];
                    console.log("Getting voting power for %d %s", account.voting_power, account.last_vote_time)
                    var voting_power = current_voting_power(account.voting_power, account.last_vote_time)
                    recovery_wait = time_needed_to_recover(voting_power, DEFAULT_THRESHOLD) / 60
                    return account
                }
            })
            .then((account) => {
                // Reschedule vote
                if (recovery_wait > 0) {
                    var later = moment().add(recovery_wait, 'minutes').toDate()
                    console.log("Rescheduling ", recovery_wait, " minutes to recover")
                    schedule.scheduleJob(later, function() {
                        processComment(comment)
                    })
                    return account
                }
                return vote(comment.author, comment.permlink, { username: user, wif: wif }, 10000)
            })
        })
}

function mainLoop() {

    console.log("Processing votes from stream of operations")
    steem.api.streamOperations((err, results) => {
        return new Promise((resolve, reject) => {
            if (err) {
                console.log("Unable to stream operations %s", err)
                return reject(err)
            }
            return resolve(results) // results [ "operation name", operation:{} ]
        }).spread((operation_name, operation) => {

            if (counter % 1000 == 0) {
                counter = 0
                console.log("Processing %s on %s", operation, new Date())
            }

            switch(operation_name) {
                case 'comment':
                    if (operation.parent_author == '') {
                        processComment(operation)
                            .catch((e) => {
                                console.log("Failed to process comment ", e)
                            });
                    }
                    break;
                case 'vote':
                    processVote(new Vote(operation))
                        .catch((e) => {
                            console.log("Failed to process vote ", e)
                        })
                    break;
                case 'unvote':
                    processUnvote(new Vote(operation))
                        .catch((e) => {
                            console.log("Failed to process unvote ", e)
                        })
                    break;
                default:
            }   
            counter++
            heartbeat = moment();
        })
        .catch((err) => {
            console.log("Bot died. Restarting ... ", err)
            mainLoop(); // restart bot since it died
        })
    })
}

function execute(voting_queue, comment_queue) {
    VOTING = voting_queue;
    COMMENTS = comment_queue;
    mainLoop();
}