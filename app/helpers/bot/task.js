'use strict'

const Promise = require('bluebird')
const steem = Promise.promisifyAll(require('steem'))
const config = require('../../config')
const moment = require('moment')
const schedule = require('node-schedule')
const Sequelize = require('sequelize')
const models = require('../../../models')
const Op = Sequelize.Op;

const UNVOTE_WEIGHT = 0

module.exports = {
    execute
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
    console.log("Processing vote ", vote)
    if (!vote.is_grumpy()) {
        console.log("Not grumpy")
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
    return models.Preferences.findAll( {
        attributes: [ 'username', 'wif', 'upvoteWeight', 'downvoteWeight', 'threshold' ]
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
    if (vote.is_for_grumpy()) {
        return collectiveDownvote(vote.author, vote.permlink)
    }
    return false
}

function processUnvote(vote) {
    if (!vote.is_grumpy()) {
        return false
    }

    return collectiveUnvote(author, permlink)
}


function downvote(author, permlink, resister) {
    return vote(author, permlink, resister, resister.downvoteWeight * -1)
}

function upvote(author, permlink, resister) {
    return vote(author, permlink, resister, resister.upvoteWeight)
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

function execute() {
    console.log("Processing votes from stream of operations")
    steem.api.streamOperations('head', (err, result) => {
        var user = config.user
        if (result && result.length > 0) {
            var operation_name = result[0]
            switch(operation_name) {
                case 'vote':
                    console.log("Handling vote ", result[1])
                    processVote(new Vote(result[1]))
                case 'unvote':
                    processUnvote(new Vote(result[1]))
                break;
                default:
            }   
        }
    })
}