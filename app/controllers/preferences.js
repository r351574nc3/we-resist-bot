`use strict`

const { db_url } = require('../config')
const Sequelize = require('sequelize')
const models = require('../../models')
const Promise = require('bluebird')
const sc2 = Promise.promisifyAll(require ('sc2-sdk'))
const steem = Promise.promisifyAll(require('steem'))

var pg = require('pg');
pg.defaults.ssl = true;
const sequelize = new Sequelize(db_url, { ssl: true })

preferences = {
    get: get_preferences,
    put: put_preferences,
    post: post_preferences,
    delete: delete_preferences
}

function get_preferences(req, res) {
    var username = req.params.username

    var api = sc2.Initialize({
        app: 'we-resist',
        callbackURL: 'https://we-resist-bot.herokuapp.com/',
        accessToken: req.query.access_token,
        scope: ['vote', 'comment']
      })

    var ok = false

    return new Promise((resolve, reject) => {
        let retval = false
        api.me(function (err, me) {
                if (me.user !== username) {
                    retval = false
                    reject(retval)
                    return
                }
                retval = true
                resolve(username)
            })
        })
        .then((username) => {
            return handle_prefs_from_database(username, res)
        })
        .catch(err => {
            console.log("Allowed to access preferences? ", err)
            return res.sendStatus(403)
        })
}

function handle_prefs_from_database(username, res) {
    return models.Preferences.findOne({where: { username: username } })
        .then(prefs => {
            var preferences = prefs.dataValues
            console.log(preferences)
            res.render('pages/index', {
                redirect: 'https://we-resist-bot.herokuapp.com/',
                username: username,
                preferences: preferences
            })
        }).catch(err => {
            models.Preferences.create({
                username: username,
                upvoteWeight: 100.00,
                downvoteWeight: 100.00,
                threshold: 100.00
            })
            .then((preferences) => {
                res.render('pages/index', {
                    redirect: 'https://we-resist-bot.herokuapp.com/',
                    username: username,
                    preferences: preferences
                })
            })
        })
}

function put_preferences(req, res) {
    models.Preferences.create(req.body)
        .save()
        .spread((prefs, created) => {
            res.send([ { 'status': 'ok' },  prefs, created ])
        })
}

function validateWif(private_key) {
    let wif_is_valid
    try {
        let public_key = steem.auth.wifToPublic(private_key)
        wif_is_valid = steem.auth.wifIsValid(private_key, public_key)
    }
    catch (error) {
        wif_is_valid = false
    }
    
    return wif_is_valid
}

function post_preferences(req, res) {
    var updatedValue = {
        upvoteWeight: req.body.upvoteWeight,
        downvoteWeight: req.body.downvoteWeight,
        threshold: req.body.threshold
    }

    var api = sc2.Initialize({
        app: 'we-resist',
        callbackURL: 'https://we-resist-bot.herokuapp.com/',
        accessToken: req.body.access_token,
        scope: ['vote', 'comment']
      })


    return new Promise((resolve, reject) => {
        let retval
        api.me((err, me) => {
                if (me) {
                    resolve(me.user)
                }
                reject(err)
            })
        })
        .then((username) => {
            if (req.body.wif !== '') {
                if (validateWif(req.body.wif)) {
                    updatedValue.wif = req.body.wif
                }
                else {
                    res.status(400)
                        .send({ status: 400,
                            error: {
                                field: 'wif',
                                message: 'Invalid Private Key'
                            }
                        })
                    return
                }
            }
        
            console.log("Looking for preferences for ", username)
            models.Preferences.find({ where: { username: username }})
                .then((prefs) => {
                    prefs.update(updatedValue)
                    res.send([ { 'status': 'ok' },  prefs ])
                })                
        })
        .catch((err) => {
            console.log(err)
            res.status(401)
        })

}

function delete_preferences(req, res) {

    // Basic REST validation
    var api = sc2.Initialize({
        app: 'we-resist',
        callbackURL: 'https://we-resist-bot.herokuapp.com/',
        accessToken: req.body.access_token,
        scope: ['vote', 'comment']
      })


    return new Promise((resolve, reject) => {
        let retval
        api.me((err, me) => {
            if (me) {
                resolve(me.user)
            }
            reject(err)
        })
    })
    .then((username) => {
        let destroyed = []
        return models.Preferences.findAll({ where: { username: username } })
            .each((prefs) => {
                destroyed.push(prefs.dataValues)
                prefs.destroy()
                Promise.resolve(destroyed)
            })
            .then((destroyed) => {
                res.status(200).send({status: 200, destroyed: destroyed })
                return destroyed
            })
    })
    res.sendStatus(500)
}

module.exports = preferences