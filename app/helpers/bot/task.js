'use strict'

const Promise = require('bluebird')
const steem = Promise.promisifyAll(require('steem'))
const sc2 = Promise.promisifyAll(require('sc2-sdk'))
const { user, wif } = require('../../config')
const moment = require('moment')
const schedule = require('node-schedule')
const Sequelize = require('sequelize')
const models = require('../../../models')
const Op = Sequelize.Op;
const Handlebars = require('handlebars')
const fs = Promise.promisifyAll(require('fs'))
const path = require('path')

const UNVOTE_WEIGHT = 0

module.exports = {
    execute
}

const SECONDS_PER_HOUR = 3600
const PERCENT_PER_DAY = 20
const HOURS_PER_DAY = 24
const MAX_VOTING_POWER = 10000
const DAYS_TO_100_PERCENT = 100 / PERCENT_PER_DAY
const SECONDS_FOR_100_PERCENT = DAYS_TO_100_PERCENT * HOURS_PER_DAY * SECONDS_PER_HOUR
const RECOVERY_RATE = MAX_VOTING_POWER / SECONDS_FOR_100_PERCENT
const DEFAULT_THRESHOLD = 9500


function current_voting_power(vp_last, last_vote) {
    var seconds_since_vote = moment().add(7, 'hours').diff(moment(last_vote), 'seconds')
    return (RECOVERY_RATE * seconds_since_vote) + vp_last
}

function time_needed_to_recover(voting_power, threshold) {
    return RECOVERY_RATE * (threshold - voting_power)
}

function loadTemplate(template) {
    return fs.readFileAsync(template, 'utf8')
}

// Stubbed function
function list_of_grumpy_users() {
    let grumps = []
    grumps.push('grumpycat')
    return new Promise((resolve, reject) => {
        resolve(grumps)
    })
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

    is_voter_grumpy() {
        // console.log("Comparing voter %s to %s", vote.voter, "grumpycat")
        return this.voter == 'grumpycat'
    }

    is_author_grumpy() {
        return list_of_grumpy_users()
            .filter((user) => this.author == user)
            .then((users) => { return users.length > 0 })
    }

    is_for_resister() {
        return list_of_resisters()
            .filter((resister) => this.author == resister.username)
            .then((resisters) => { return resisters.length > 0 })
    }
}

function processVote(vote) {
    if (!vote.is_voter_grumpy()) {
         return false
    }

    console.log("processing vote ", vote);

    if (vote.is_upvote()) {
        return processUpvote(vote)
    }

    if (vote.is_for_resister()) {
        return processDownvote(vote)
    }
    return invite(vote.author, vote.permlink);
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
        attributes: [ 'username', 'wif', 'upvoteWeight', 'downvoteWeight', 'threshold' ],
        logging: (query) => {}
    })
}

function is_active(resister) {
    return true
}

function processDownvote(vote) {
    console.log('Processing vote ', vote)
    return collectiveUpvote(vote.author, vote.permlink)
}

function processUpvote(vote) {
    return vote.is_author_grumpy()
        .then((is_grumpy) => {
            if (is_grumpy) { // Test for self-vote
                console.log("Downvoting ", vote)
                return collectiveDownvote(vote.author, vote.permlink)
            }

            // Not a self-vote
            Promise.reject("Not a self vote")
        })
        .catch(err => {
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
    return reply(author, permlink, "invite");
}

function reply(author, permlink, type) {
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
            steem.broadcast.commentAsync(
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
            })
        })
}

function downvote(author, permlink, resister) {
    return vote(author, permlink, resister, resister.downvoteWeight * -100)
        .then((promise) => { return reply(author, permlink, "downvote") });
}

function upvote(author, permlink, resister) {
    var recovery_wait = 0
    return steem.api.getAccountsAsync([ resister.username ]).then((account) => {
        var voting_power = current_voting_power(account.voting_power, account.last_vote_time)
        recovery_wait = time_needed_to_recover(voting_power, resister.threshold) / 60
        return account
    })
    .then((account) => {
        // Reschedule vote
        if (recovery_wait > 0) {
            var later = moment().add(recovery_wait, 'minutes').toDate()
            console.log("Rescheduling ", recovery_wait, " minutes to recover")
            schedule.scheduleJob(later, function() {
                upvote(author, permlink, resister, resister.upvoteWeight * 100)
            })
            return account
        }
        return vote(author, permlink, resister, resister.upvoteWeight * 100)
            .then((promise) => { return reply(author, permlink, "upvote") });
    })
}

function unvote(author, permlink, resister) {
    return vote(author, permlink, resister, UNVOTE_WEIGHT)
}

function vote(author, permlink, resister, weight) {
    return steem.broadcast.voteAsync(
            resister.wif, 
            resister.username, 
            author,
            permlink,
            weight
        )
        .then((results) =>  {
            console.log(results)
        })
        .catch((err) => {
            console.log("Vote failed: ", err)
        })
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
        .filter((resister) => comment.author == resister.username)
        .each((resister) => {
            var recovery_wait = 0
            return steem.api.getAccountsAsync([ user ]).then((account) => {
                var voting_power = current_voting_power(account.voting_power, account.last_vote_time)
                recovery_wait = time_needed_to_recover(voting_power, DEFAULT_THRESHOLD) / 60
                return account
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

function execute() {
    console.log("Processing votes from stream of operations")
    steem.api.streamOperations('head', (err, result) => {
        if (result && result.length > 0) {
            var operation_name = result[0]
            switch(operation_name) {
                case 'comment':
                    processComment(result[1]);
                    break;
                case 'vote':
                    console.log("Handling vote ", result[1])
                    processVote(new Vote(result[1]))
                    break;
                case 'unvote':
                    processUnvote(new Vote(result[1]))
                    break;
                default:
            }   
        }
    })
}