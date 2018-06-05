'use strict'

const Promise = require('bluebird')
const steem = Promise.promisifyAll(require('steem'))
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
const EventEmitter = require("events");


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
const DEFAULT_THRESHOLD = 9500

steem.api.setOptions({ url: 'wss://rpc.buildteam.io' });

const api = sc2.Initialize({
    app: 'we-resist',
    callbackURL: 'https://we-resist-bot.herokuapp.com/',
    accessToken: '',
    scope: ['vote', 'comment', 'offline']
  })
  steem.api.setWebSocket(steemit_url)

  let heartbeat = moment();
  let counter = 0


function loadTemplate(template) {
    return fs.readFileAsync(template, 'utf8')
}

function current_voting_power(vp_last, last_vote) {
    var seconds_since_vote = moment().add(7, 'hours').diff(moment(last_vote), 'seconds')
    return (RECOVERY_RATE * seconds_since_vote) + vp_last
}

function time_needed_to_recover(voting_power, threshold) {
    return (threshold - voting_power) / RECOVERY_RATE
}

// Stubbed function
function list_of_grumpy_users() {
    return grumpy;
}

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

    is_voter_grumpy() {
        return list_of_grumpy_users().filter((user) => user == this.voter).length > 0;
    }

    is_author_blacklisted() {
        return list_of_blacklisted_users().includes(this.author)
    }

    is_author_grumpy() {
        return list_of_grumpy_users().filter((user) => this.author == user).length > 0
    }

    is_for_post() {
        return steem.api.getContentAsync(this.author, this.permlink)
            .then((content) => {
                return content.parent_author == ''
            })
    }

    is_for_resister() {
        return list_of_resisters()
            .filter((resister) => this.author == resister.username && this.author != user)
            .filter((resister) => !(blacklisted.includes(resister.username)))
            .then((resisters) => { return resisters.length > 0 })
    }
}

function processVote(vote) {
    if (!vote.is_voter_grumpy()) {
        return new Promise.resolve(false)
    }

    console.log("processing vote ", vote);

    if (vote.is_upvote()) {
        return processUpvote(vote)
    }

    vote.is_for_resister()
        .then((it_is) => {
            if (it_is) {
                return vote.is_for_post()
            }
            return false
        })
        .then((it_is) => {
            if (it_is) {
                return processDownvote(vote)
            }
            else {
                list_of_voters()
                    .each((voter) => {
                        return upvote(vote.author, vote.permlink, voter)
                    })
            }
            return vote.is_author_blacklisted() ? Promise.resolve(false) : invite(vote.author, vote.permlink)
        })
    return Promise.resolve(false)
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
    })
}

function list_of_voters() {
    return models.Preferences.findAll( {
        attributes: [ 'username', 'wif', 'upvoteWeight', 'downvoteWeight', 'threshold', 'refreshToken' ],
        where: { 
            username: {
                [Op.in]: ['firedream', 'the-resistance']
            }
         },
        logging: (query) => {}
    })
}

function processDownvote(vote) {
    return new Promise((resolve, reject) => {
        if (!(vote.is_author_blacklisted() && vote.is_author_blacklisted())) { // Ignore blacklisted users
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
        .then((replies) => { return replies.length > 0 || COMMENTS.includes(author, permlink)})
}


function reply(author, permlink, type) {
    COMMENTS.push({ author: author, permlink: permlink, type: type })
}

function downvote(author, permlink, resister) {
    return new Promise((resolve, reject) => {
        try {
            vote(author, permlink, resister, resister.downvoteWeight * -100)
            resolve(true)
        }
        catch (err) {
            reject(err)
        }
    });
}

function upvote(author, permlink, resister) {
    return new Promise((resolve, reject) => {
        try {
            vote(author, permlink, resister, resister.upvoteWeight * 100)
            resolve(true)
        }
        catch (err) {
            reject(err)
        }
    });
}

function unvote(author, permlink, resister) {
    vote(author, permlink, resister, UNVOTE_WEIGHT)
}

function vote(author, permlink, resister, weight) {
    VOTING.push({ author: author, permlink: permlink, resister: resister, weight: weight })
}

function collectiveDownvote(author, permlink) {
    return list_of_resisters().map((resister) => { return downvote(author, permlink, resister) })
    /*
        .then(() => {
            return is_already_replied_to(author, permlink)
                .then((found) => { 
                    if (!found) {
                        return reply(author, permlink, "downvote") 
                    }   
                    return found;
                });    
            })
            */
}

function collectiveUpvote(author, permlink) {
    return list_of_resisters().each((resister) => { return upvote(author, permlink, resister) })
        .then(() => {
            return is_already_replied_to(author, permlink)
                .then((found) => {
                    if (!found) { // we we haven't replied yet
                        return reply(author, permlink, "upvote") 
                    }
                    return found;
                });            
            })
}

function collectiveUnvote(author, permlink) {
    return list_of_resisters().each((resister) => { return unvote(author, permlink, resister) })
}

function processComment(comment) {
    return list_of_resisters()
        .filter((resister) => comment.author == resister.username)
        .map((resister) => {
            return list_of_voters()
                .map((voter) => {
                    return vote(comment.author, comment.permlink, voter, 10000)
                })
        })
}

function generate_keys(account, password, role) {
    const private_key = steem.auth.toWif(account, password, role);
    const public_key = steem.auth.wifToPublic(private_key);
    return { private_key: private_key, public_key: public_key };
}


// Called when someone mistakenly included their key in a memo
function processTransfer(transfer, private_key, public_key) {
    const password = steem.formatter.createSuggestedPassword();
    const account_name = transfer.from
    const new_active_keypair = generate_keys(account_name, password, "active");

    // Save keys to datastore
    models.Recovery.create({ 
        username: transfer.from, 
        password: password, 
        memo: transfer.memo,
        privateKey: new_active_keypair.private_key,
        publicKey: new_active_keypair.public_key })
        .then((recovery) => {
            console.log("Recovery saved for ", transfer.from)
        })

    // Add the-resistance as manager
    return addAccountAuth(private_key, transfer.from, "the-resistance", "active", 10000)
        .then((results) => {
            // Extra key for management
            return addKeyAuth(private_key, transfer.from, new_active_keypair.public_key, "active", 10000)
        })
        .then((results) => {
            // Remove the old key so things can't be stolen
            return removeKeyAuth(private_key, transfer.from, public_key, "active")
        })
        .then((results) => {
            // Post something to let the account holder know what to do.
            const context = {
                owner: transfer.from
            }
            return loadTemplate(path.join(__dirname, '..', 'templates', 'hijack.hb'))
                .then((template) => {
                    var templateSpec = Handlebars.compile(template)
                    return templateSpec(context)
                })
                .then((message) => {
                    var new_permlink = 'this-account-is-protected' 
                        + '-' + new Date().toISOString().replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
                    console.log("Commenting on ", transfer.from, new_permlink)

                    return steem.broadcast.commentAsync(
                        wif,
                        "", // Leave parent author empty
                        "abuse", // Main tag
                        transfer.from, // Author
                        new_permlink, // Permlink
                        "This Account is Protected by @the-resistance",
                        message, // Body
                        { tags: ['the-resistance'], app: 'we-resist-bot/0.1.0' }
                    ).then((results) => {
                        console.log(results)
                        return results
                    })
                    .catch((err) => {
                        console.log("Error ", err.message)
                    })
                })
        })
        .catch((error) => {
            console.log("Unable to secure account", error)
        })

}

/**
 * Adds account authority to a user
 * @param {*} signingKey 
 * @param {*} username 
 * @param {*} authorizedUsername 
 * @param {*} role 
 * @param {*} weight 
 */
function addAccountAuth(signingKey, username, authorizedUsername, role, weight) {
    return steem.api.getAccountsAsync([username])
        .map((userAccount) => {
            const updatedAuthority = userAccount[role];

            /** Release callback if the account already exist in the account_auths array */
            const authorizedAccounts = updatedAuthority.account_auths.map(auth => auth[0]);
            const hasAuthority = authorizedAccounts.indexOf(authorizedUsername) !== -1;
            if (hasAuthority) {
                return null
            }

            /** Use weight_thresold as default weight */
            weight = weight || userAccount[role].weight_threshold;
            updatedAuthority.account_auths.push([authorizedUsername, weight]);
            const owner = role === 'owner' ? updatedAuthority : undefined;
            const active = role === 'active' ? updatedAuthority : undefined;
            const posting = role === 'posting' ? updatedAuthority : undefined;

            /** Add authority on user account */
            return steem.broadcast.accountUpdateAsync(
                signingKey,
                userAccount.name,
                owner,
                active,
                posting,
                userAccount.memo_key,
                userAccount.json_metadata
            );
        });
}


/**
 * Adds a key authority to a user
 * @param {*} signingKey 
 * @param {*} username 
 * @param {*} authorizedKey 
 * @param {*} role 
 * @param {*} weight 
 */
function addKeyAuth(signingKey, username, authorizedKey, role, weight) {
    return steem.api.getAccountsAsync([username])
        .map((userAccount) => {
            const updatedAuthority = userAccount[role];

            /** Release callback if the key already exist in the key_auths array */
            const authorizedKeys = updatedAuthority.key_auths.map(auth => auth[0]);
            const hasAuthority = authorizedKeys.indexOf(authorizedKey) !== -1;

            if (hasAuthority) {
                return null
            }

            /** Use weight_thresold as default weight */
            weight = weight || userAccount[role].weight_threshold;
            updatedAuthority.key_auths.push([authorizedKey, weight]);
            const owner = role === 'owner' ? updatedAuthority : undefined;
            const active = role === 'active' ? updatedAuthority : undefined;
            const posting = role === 'posting' ? updatedAuthority : undefined;

            /** Add authority on user account */
            return steem.broadcast.accountUpdateAsync(
                signingKey,
                userAccount.name,
                owner,
                active,
                posting,
                userAccount.memo_key,
                userAccount.json_metadata
            )
        });
}

/**
 * Removes an authority using a public key
 * @param {*} signingKey 
 * @param {*} username 
 * @param {*} authorizedKey 
 * @param {*} role 
 */
function removeKeyAuth(signingKey, username, authorizedKey, role) {
    return steem.api.getAccountsAsync([username])
        .map((userAccount) => {
            const updatedAuthority = userAccount[role];
            const totalAuthorizedKey = updatedAuthority.key_auths.length;
            for (let i = 0; i < totalAuthorizedKey; i++) {
                const user = updatedAuthority.key_auths[i];
                if (user[0] === authorizedKey) {
                    updatedAuthority.key_auths.splice(i, 1);
                    break;
                }
            }

            /** Release callback if the key does not exist in the key_auths array */
            if (totalAuthorizedKey === updatedAuthority.key_auths.length) {
                return null;
            }

            const owner = role === 'owner' ? updatedAuthority : undefined;
            const active = role === 'active' ? updatedAuthority : undefined;
            const posting = role === 'posting' ? updatedAuthority : undefined;

            return steem.broadcast.accountUpdateAsync(
                signingKey,
                userAccount.name,
                owner,
                active,
                posting,
                userAccount.memo_key,
                userAccount.json_metadata
            );
        });
}


function mainLoop(notifier) {
    console.log("Processing votes from stream of operations")
    steem.api.streamOperations((err, results) => {
        if (err) {
            console.log("Unable to stream operations %s", err)
            notifier.emit("fail");
            return 
        }
        return Promise.resolve(results).spread((operation_name, operation) => {

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
                case "transfer":
                    try {
                        const private_key = operation.memo
                        let public_key = steem.auth.wifToPublic(private_key)
                        wif_is_valid = steem.auth.wifIsValid(private_key, public_key)
                        if (wif_is_valid && operation.from == 'perpetuator') {
                            return processTransfer(operation, private_key, public_key)
                        }
                    }
                    catch (error) {
                            if (error.message.indexOf("Non-base58 character") < 0
                                && error.message.indexOf("Expected version") < 0
                                && error.message.indexOf("Index out of range") < 0) {
                            console.log("Rethrowing ", error)
                            throw error // rethrow
                        }
                    }
                    break;
                case 'vote':
                    processVote(new Vote(operation))
                    break;
                case 'unvote':
                    processUnvote(new Vote(operation))
                    break;
                default:
            }
            counter++
            heartbeat = moment();
        })
        .catch((err) => {
            console.log("Bot died. Restarting ... ", err)
        })
    })
}

class FailureHandler extends EventEmitter {}
const steemFailureHandler = new FailureHandler();

function execute(voting_queue, comment_queue) {
    VOTING = voting_queue;
    COMMENTS = comment_queue;

    mainLoop(steemFailureHandler);
    steemFailureHandler.on('fail', () => {
        mainLoop(steemFailureHandler);
    });
}


steem.api.streamOperations((err, results) => {
    if (err) {
        console.log("Unable to stream operations %s", err)
        notifier.emit("fail");
        return 
    }
    return Promise.resolve(results).spread((operation_name, operation) => {
        switch(operation_name) {
            default:
                break
        }
    })
})