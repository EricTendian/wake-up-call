// jshint node: true
"use strict";
var express = require('express');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var schedule = require('node-schedule');
var chrono = require('chrono-node');
var moment = require('moment');
var https = require('https');
var qs = require('querystring');

var app = express();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

var api = process.env.TWILIO_SID;
var auth = process.env.TWILIO_AUTH;
var from_phone = process.env.FROM_PHONE_NUMBER;

//an object literal with key value pairs of phone numbers and the right answer
// #TODO remove key/values after the call has ended
var answers = {
  PHONE_NUMBER: "answer"
};

var callPerson = function(phone) {
  var postdata = qs.stringify({
    'From': from_phone,
    'To': phone,
    'Url': 'http://wake-up-call.herokuapp.com/'
  });

  var options = {
    host: 'api.twilio.com',
    path: '/2010-04-01/Accounts/' + api + '/Calls.xml',
    port: 443,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postdata.length
    },
    auth: api + ':' + auth
  };

  var request = https.request(options, function(res) {
    res.setEncoding('utf8');
    res.on('data', function(chunk) {
      console.log('Response: ' + chunk);
    });
  });

  request.write(postdata);
  request.end();
};

app.get('/', function(request, response) {
  response.send('Send a text message to '+from_phone+' in the form of something like \"tomorrow at 7:00am\" and you will get a confirmation text, then a subsequent call. All times are currently in Central Time.');
});

app.post('/', function(request, response) {

  if (request.body.hasOwnProperty("Body")) {
    var textMessage = request.body.Body; // like 23:15
    var time = chrono.parseDate(textMessage);
    if (time) {
      var personPhone = request.body.From;
      var j = schedule.scheduleJob(time, function() {
        console.log("It's time to call " + personPhone);
        // what to do when the alarm rings
        callPerson(personPhone);
      });
      console.log("successful cron job creation");
      response.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>Good night, you will receive a wake-up call from us "+moment(time).fromNow()+".</Message></Response>");
    } else {
      console.log("cron job incorrectly formatted");
      response.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>Sorry, we couldn't understand that. Try using a time like \"tomorrow at 7:00am\"</Message></Response>");
    }
  } else if (request.body.hasOwnProperty("CallSid") && !request.body.hasOwnProperty("Digits")) {
    //generating a random math problem
    var num1 = Math.floor(Math.random() * 10 + 10);
    var num2 = Math.floor(Math.random() * 10);
    var answer = num1 + num2;
    answer = parseInt(answer);
    //using the gather TwiML to receive keypad input
    response.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Pause length=\"3\"/><Gather timeout=\"45\" finishOnKey=\"*\"><Say>Good Morning. What is " + num1 + " plus " + num2 + "? Type your answer then press star.</Say></Gather></Response>");

    answers[request.body.From] = answer;
    //checking if the answer was answered correctly, meaning the answer would be 0
  } else if (
    request.body.hasOwnProperty("CallStatus") &&
    (request.body.CallStatus == "completed" || request.body.CallStatus == "canceled") &&
    answers[request.body.From] > 0
  ) {
    callPerson(request.body.From); //#TODO right now this does not work
  } else {
    //checking if the request was an input
    if (request.body.hasOwnProperty("Digits")) {
      var input = request.body.Digits;
      if (input.length == 4) {
        input = input.charAt(0) + input.charAt(2); // in case we get double DTMF codes (1 -> 11, 2 -> 22, etc)
      }
      input = parseInt(input);
      if (input === parseInt(answers[request.body.From], 10)) {
        response.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>That is correct. Have a great morning! Bye.</Say></Response>");
        answers[request.body.From] = 0; // 0 means the answer was inputted correctly
      } else {
        var wrong = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>I'm sorry, that's wrong. This is what you entered: " + input + "</Say></Response>";
        response.send(wrong);
      }
    } else {
      response.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>We didn't receive any input. Goodbye!</Say></Response>");
    }
  }

  //response.send(200); //Send a reply saying OK
  //Because there is no response, heroku logs an error
});

//heroku assigns ports automatically
var port = process.env.PORT || 5000;
app.listen(port, function() {
  console.log("Listening on " + port);
});
