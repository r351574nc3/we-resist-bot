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
    includes: (author, permlink) => {
        comment_queue.filter((comment) => comment.author == author && comment.permlink == permlink).length > 0
    },
    push: (obj) => { 
        return comment_queue.push(obj) 
    },
    pop: () => { return comment_queue.pop() },
    shift: () => {
        return comment_queue.shift() 
    },
    unshift: (obj) => { return comment_queue.unshift(obj) }
}

function run() {
    require('./vote').execute(voting);
    require('./comment').execute(comments);
    require('./task').execute(voting, comments);
}