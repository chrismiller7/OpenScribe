'use strict';
const fs = require('fs');

function infiniteStream(config, interimCallback, finalCallback) 
{
  const streamingLimit = config.streamingLimit; // ms - set to low number for demo purposes

  
  const chalk = require('chalk');
  const {Transform} = require('stream');
  const recorder = require('node-record-lpcm16');
  const speech = require('@google-cloud/speech').v1p1beta1;

  const client = new speech.SpeechClient();


  const request = {
	  config: {
		encoding: 			config.encoding,
		sampleRateHertz: 	config.sampleRateHertz,
		languageCode: 		config.languageCode,
		profanityFilter: 	config.profanityFilter,
		useEnhanced: 		config.useEnhanced,
		enableAutomaticPunctuation: config.enableAutomaticPunctuation
	  },
    interimResults: true,
  };


  let recognizeStream = null;
  let restartCounter = 0;
  let audioInput = [];
  let lastAudioInput = [];
  let resultEndTime = 0;
  let lastTranscriptTime = 0;
  let isFinalEndTime = 0;
  let finalRequestEndTime = 0;
  let newStream = true;
  let bridgingOffset = 0;
  let lastTranscriptWasFinal = false;

  let restartTimerId = 0;
  
  function startStream() 
  {
    // Clear current audioInput
    audioInput = [];
    // Initiate (Reinitiate) a recognize stream
    recognizeStream = client
      .streamingRecognize(request)
      .on('error', err => {
        if (err.code === 11) {
          // restartStream();
        } else {
          console.error('API request error ' + err);
        }
      })
      .on('data', speechCallback);

    // Restart stream when streamingLimit expires
	clearTimeout(restartTimerId);
    restartTimerId = setTimeout(restartStream, streamingLimit);
  }
  
  var lastTrans = "";

  const speechCallback = stream => {
	  
	//console.log(stream.results[0]);

    resultEndTime = stream.results[0].resultEndTime.seconds * 1000 + Math.round(stream.results[0].resultEndTime.nanos / 1000000);
    // Calculate correct time based on offset from audio sent twice
    const correctedTime = resultEndTime - bridgingOffset + streamingLimit * restartCounter;

	if (!stream.results[0].isFinal)
	{
		if (resultEndTime <= lastTranscriptTime)
		{
			process.stdout.write(chalk.yellow(`Rejecting old data\n`));
			return;
		}
	
		if (lastTrans == stream.results[0].alternatives[0].transcript || stream.results[0].stability < 0.7)
		{
			return;
		}
	}
	
	lastTranscriptTime = resultEndTime;
	lastTrans = stream.results[0].alternatives[0].transcript;
	
    let stdoutText = '';
    if (stream.results[0] && stream.results[0].alternatives[0]) {
      stdoutText = correctedTime + ': ' +  ": " + stream.results[0].stability + ": " + stream.results[0].alternatives[0].transcript;
	  lastTrans = stream.results[0].alternatives[0].transcript;
    }
	
    if (stream.results[0].isFinal) 
	{
      process.stdout.write(chalk.green(`${stdoutText}\n`));
	  finalCallback(stream.results[0].alternatives[0].transcript);
      isFinalEndTime = resultEndTime;
      lastTranscriptWasFinal = true;
	  lastTranscriptTime = 0;
	  audioInput = [];
	  restartStream();
    } 
	else 
	{
      process.stdout.write(chalk.red(`${stdoutText}\n`));
	  interimCallback(stream.results[0].alternatives[0].transcript);
      lastTranscriptWasFinal = false;
    }
  };

  const audioInputStreamTransform = new Transform({
    transform: (chunk, encoding, callback) => {
		//console.log(chunk.length);
      if (newStream && lastAudioInput.length !== 0) {
        // Approximate math to calculate time of chunks
        const chunkTime = streamingLimit / lastAudioInput.length;
        if (chunkTime !== 0) {
          if (bridgingOffset < 0) {
            bridgingOffset = 0;
          }
          if (bridgingOffset > finalRequestEndTime) {
            bridgingOffset = finalRequestEndTime;
          }
          const chunksFromMS = Math.floor(
            (finalRequestEndTime - bridgingOffset) / chunkTime
          );
          bridgingOffset = Math.floor(
            (lastAudioInput.length - chunksFromMS) * chunkTime
          );

          for (let i = chunksFromMS; i < lastAudioInput.length; i++) {
            recognizeStream.write(lastAudioInput[i]);
          }
        }
        newStream = false;
      }

      audioInput.push(chunk);

      if (recognizeStream) {
        recognizeStream.write(chunk);
      }

      callback();
    },
  });

  function restartStream() {
    if (recognizeStream) {
      recognizeStream.removeListener('data', speechCallback);
      recognizeStream = null;
    }
    if (resultEndTime > 0) {
      finalRequestEndTime = isFinalEndTime;
    }
    resultEndTime = 0;

    lastAudioInput = [];
    lastAudioInput = audioInput;

    restartCounter++;

    if (!lastTranscriptWasFinal) {
      process.stdout.write(`\n`);
    }
    process.stdout.write(
      chalk.yellow(`${streamingLimit * restartCounter}: RESTARTING REQUEST\n`)
    );

    newStream = true;

    startStream();
  }
  // Start recording and send the microphone input to the Speech API
  recorder
    .record({
      sampleRateHertz: config.sampleRateHertz,
      threshold: 0, // Silence threshold
      silence: 1000,
      keepSilence: true,
      recordProgram: 'rec', // Try also "arecord" or "sox"
    })
    .stream()
    .on('error', err => {
      console.error('Audio recording error ' + err);
    })
    .pipe(audioInputStreamTransform);

  /*console.log('');
  console.log('Listening, press Ctrl+C to stop.');
  console.log('');
  console.log('End (ms)       Transcript Results/Status');
  console.log('=========================================================');
*/
  startStream();
  // [END speech_transcribe_infinite_streaming]
}

/*class GoogleSpeech extends EventEmitter
{
	constructor()
	{
		infiniteStream(this.onInterim.bind(this), this.onFinal.bind(this));
	}
	
	onInterim() {}
	onFinal() {}
}*/

module.exports = infiniteStream;
