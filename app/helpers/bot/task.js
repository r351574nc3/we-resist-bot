'use strict'

const Promise = require('bluebird')
const steem = Promise.promisifyAll(require('steem'))
const config = require('../../config')
const moment = require('moment')
const schedule = require('node-schedule')


const UNVOTE_WEIGHT = 0

module.exports = {
    execute
}

// Stubbed function
function list_of_grumpy_users() {
    return new Promise((resolve, reject) => {
        resolve([])
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

    is_grumpy() {
        return this.voter == 'grumpycat'
    }

    is_for_grumpy() {
        return list_of_grumpy_users()
            .filter((user) => this.author == user)
            .then((users) => { return users.length > 0 })
    }
}

function processVote(vote) {
    if (!vote.is_grumpy()) {
        return false
    }

    if (vote.is_upvote()) {
        return processUpvote(vote)
    }
    return processDownvote(vote)
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
    return new Promise((resolve, reject) => {
        resolve([])
    })
}

function is_active(resister) {
    return false
}

function processDownvote(vote) {
    return collectiveUpvote(vote.author, vote.permlink)
}

function processUpvote(vote) {
    if (vote.is_for_grumpy()) {
        return collectiveUpvote(vote.author, vote.permlink)
    }
    return false
}

function processUnvote(vote) {
    if (!vote.is_grumpy()) {
        return false
    }

    return collectiveVote(author, permlink, UNVOTE_WEIGHT)
}

function collectiveDownvote(author, permlink) {
    return collectiveVote(author, permlink, resister.downvoteWeight)
}

function collectiveVote(author, permlink, weight) {
    return list_of_resisters().filter((resister) => is_active(resister))
        .each((resister) => {
            return steem.broadcast.voteAsync(
                    resister.wif, 
                    resister.name, 
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
    })
}

function collectiveUpvote(author, permlink) {
    return collectiveVote(author, permlink, resister.upvoteWeight)
}

function execute() {
    steem.api.streamOperations('head', (err, result) => {
        var user = config.user
        if (result && result.length > 0) {
            var operation_name = result[0]
            switch(operation_name) {
                case 'vote':
                    processVote(new Vote(result[1]))
                case 'unvote':
                    processUnvote(new Vote(result[1]))
                break;
                default:
            }   
        }
    })
}