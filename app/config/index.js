config = {
    user: process.env.STEEM_NAME || "YOU NEED TO FILL THIS IN ICEHOLE",
    wif: process.env.STEEM_WIF || "YOU NEED TO FILL THIS IN ICEHOLE",
    sc2_secret: process.env.SC2_CLIENT_SECRET || "YOU NEED TO FILL THIS IN",
    steemit_url: "https://api.steemit.com",
    db_url: process.env.DATABASE_URL || "URL NOT SET"
}


module.exports = config