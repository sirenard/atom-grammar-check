'use babel';

import {Mutex} from "async-mutex";

export async function correctWithGinger(text) {
    let res = [];
    let gingerbread = require('gingerbread');
    let gingerMutex = new Mutex();
    const releaseGinger = await gingerMutex.acquire();
    await gingerbread(text, (error, text, result, corrections) => {
        if(!error) {
            for (let correction of corrections) {
                res.push(makeCorrection(correction.start, correction.length, [correction.correct]));
            }
        }
        releaseGinger();
    });

    const release = await gingerMutex.acquire();//wait the end of the correction
    release();

    return res;
}


export async function correctLanguageTool(text, ...args){
    let res = [];
    let url = new URL(args.url || 'http://localhost:8081/v2/check')
    let params = {text: text, language: args.language || 'auto'}
    url.search = new URLSearchParams(params).toString();
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            "Content-Type": "application/json"
        }
    });

    const queryResult = await response.json(); //extract JSON from the http response

    if(queryResult.matches){
        queryResult.matches.map(match =>{
            res.push(makeCorrection(match.context.offset, match.context.length, match.replacements.map(v => v.value)));
        });
    }

    return res;

}

function makeCorrection(start, length, replacements) {
    return {
        start: start,
        length: length,
        replacements: replacements
    };
}