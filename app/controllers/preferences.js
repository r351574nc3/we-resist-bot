`use strict`

const { db_url } = require('../config')
const Sequelize = require('sequelize')
const models = require('../../models')
const Promise = require('bluebird')
const sc2 = Promise.promisifyAll(require ('sc2-sdk'))

var pg = require('pg');
pg.defaults.ssl = true;
const sequelize = new Sequelize(db_url, { ssl: true })

preferences = {
    get: get_preferences,
    put: put_preferences,
    post: post_preferences
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

function post_preferences(req, res) {
    var updatedValue = {
        upvoteWeight: req.body.upvoteWeight,
        downvoteWeight: req.body.downvoteWeight,
        threshold: req.body.threshold
    }

    console.log("token ", req.body.access_token)

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
                    res.sendStatus(400)
                        .send({ status: 400,
                            error: {
                                field: 'wif',
                                message: 'Invalid Private Key'
                            }
                        })
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

module.exports = preferences