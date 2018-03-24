'use strict'


module.exports = {
    run
}

const voting_queue = [];
const comment_queue = [];

const voting = {
    length: () => { return voting_queue.length },
    push: (obj) => { return voting_queue.push(obj) },
    pop: () => { return voting_queue.pop() },
    shift: () => { return voting_queue.shift() },
    unshift: (obj) => { return voting_queue.unshift(obj) }
}

const comments = {
    length: () => { return comment_queue.length },
    push: (obj) => { 
        return comment_queue.push(obj) 
    },
    pop: () => { return comment_queue.pop() },
    shift: () => {
        console.log("Shifting comments ", comment_queue)
        return comment_queue.shift() 
    },
    unshift: (obj) => { return comment_queue.unshift(obj) }
}

function run() {
    require('./vote').execute(voting);
    require('./comment').execute(comments);
    require('./task').execute(voting, comments);
}