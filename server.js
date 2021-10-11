const fs = require('fs');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const googleSpeechInit = require('./GoogleSpeech.js');
const dateFormat = require('dateformat');


const app = express();
const server = http.createServer(app);


const config = JSON.parse(fs.readFileSync('config.json'));
console.log("\n");
console.log("Current Config: \n");
console.log(config);
console.log("\n");

console.log("Automatic shut down in " + config.shutdownAfterMins + " minutes.");

setTimeout((function() {
	console.log("Auto shutdown!!!");
    return process.exit(22);
}), config.shutdownAfterMins*60*1000);


app.use(express.static('html'));

app.get('/', (req, res) => {
	return res.redirect(`index.html`);
});

server.listen(3000, () => {
  const address = server.address();
  console.log("\n");
   console.log("Web server started.");
  console.log(`Open browser to:  http://localhost:${address.port}\n`);
  console.log("\n");
});



const wss = new WebSocket.Server({ server });

function sendAll(data)
{
	wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
}

function OnInterim(str) 
{
	console.log('OnInterim: ' + str);
	sendAll(JSON.stringify({str:str}));
	LogData("Interim", str, false);
}

function OnFinal(str) 
{
	console.log('OnFinal: ' + str);
	sendAll(JSON.stringify({str:str, isFinal:true}));
	LogData("Final", str, true);
}


var useDummyData = false;


var text = "";
var c =0;
var c2 = 0;
if (useDummyData)
{
	setInterval(()=>
	{
			text += "Something " + c + " ";
			c2++;
			OnInterim(text);
			
			if (c2 >= 26) 
			{
				OnFinal(text);
				c++;
				c2 = 0;
				text = "";
			}
	}, 200);
}
else 
{
	googleSpeechInit(config, OnInterim, OnFinal);
}

function LogData(header, data, isFinal)
{
	var dateStr = dateFormat(new Date(), "yyyy-mm-dd");
	var logFile = "logs/log " + dateStr + ".txt";
	
	var timeStr = dateFormat(new Date(), "hh:MM:ss.l");
	var line = timeStr + ": " + header + ": " + data + "\n";
	if (isFinal) 
		line += "\n";
	
	fs.appendFile(logFile, line, function (err) {
		//if (err) throw err;
		//console.log('Saved!');
	});
}