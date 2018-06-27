const express = require('express')
const app = express()
const { spawn } = require('child_process');
var fs = require('fs');
var util = require('util');

// INIT
const config = JSON.parse(fs.readFileSync('mainframe_config.json', 'utf8'));
const totems = JSON.parse(fs.readFileSync('../totem_details.json', 'utf8'));
// Logs new file monthly
const logMonths = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]

var debug = false;
if(process.argv.includes("debug")) {
  debug = true;
}

makeLogEntry(" *** RESTARTING MAINFRAME *** ")

// If the 'init' command is given, initialise with a content refresh
// Else, set the timers to update as normal

if(process.argv.includes("init")) {
  makeLogEntry("Init command set - refreshing all content");
  refreshAll();
} else {
  // Set timers for regular updates
  makeLogEntry("No init command given; setting timers for regular updates")
  setTimeout(function() { updateSensors() }, getMillisecondsTilMinute(config.updateSensorsMinuteInterval));
  setTimeout(function() { updateILI() }, getMillisecondsTilMinute(config.updateILIMinuteInterval));

  // Set daily downloads
  setTimeout(function() { sourceSensors() }, getMillisecondsTilHour(config.sourceSensorsHour));
  setTimeout(function() { sourceILI() }, getMillisecondsTilHour(config.sourceILIHour));
}

// Refreshses all content by sourcing, cleaning, and uploading updates
function refreshAll() {

  makeLogEntry("Refreshing all content")

  // Source sensor content
  sourceSensors();

  // Source ILI content
  sourceILI();
}

//// SENSORS

// Fetches content for sensors, i.e. descriptions, taglines, and labels
function sourceSensors(retry=0) {

  makeLogEntry("Sourcing sensor content - attempt " + (retry+1))

  // Call the function
  var script = spawn('python', ['../sensors/fetch_content.py'], {cwd: '../sensors'});

  var complete = false;

  var log = {
    type: "source",
    timestamp: Date.now(),
    success: false,
    errors: [],
    warnings: []
  }

  // stdout should log warnings
  script.stdout.on('data', function(data) {
    if(!complete) {
      log.warnings.push(data.toString());
    }
  });

  // stderr logs errors
  script.stderr.on('data', function(data) {
    if(!complete) {
      log.errors.push(data.toString());
    }
  });

  script.on("exit", function(code, sig) {
    complete = true;
    if(code == 0) {
      log.success = true;
    } else {
      log.errors.push("Exited with code " + code);
    }

    // Save the log
    // TODO - sensorlog table - enter that we sourced content

    // Set the timer for next time
    if(log.success) {

      makeLogEntry("Successfully sourced sensor content", "S")

      // If success, set timer for tomorrow at 8am
      setTimeout(function() { sourceSensors() }, getMillisecondsTilHour(config.sourceSensorsHour));

      updateSensors();

    } else {
      // If fail, retry twice, then raise an error and wait a day
      if(retry >= 2) {

        // Out of retries - raise alert
        // TODO

        makeLogEntry("Unable to source sensor content", "F")

        // Set timer to try next time
        setTimeout(function() { sourceSensors() }, getMillisecondsTilHour(config.sourceSensorsHour))

        console.log(log);

        // Done for now - refresh sensors
        updateSensors();

      } else {
        // Wait 10 secs and retry
        makeLogEntry("Failed - retrying...", "F")
        setTimeout(function() { sourceSensors(++retry) }, 10000)
      }
    }
  });
}

// Update sensors - should be called every 10 minutes
function updateSensors(retry=0) {

  makeLogEntry("Updating sensors - attempt " + (retry+1))

  // run update_sensors
  var script = spawn('python', ['../sensors/update_sensors.py'], {cwd: '../sensors'});

  // Completion flag to enforce synchronous execution; may be superfluous
  var complete = false;

  var log = {
    type: "update",
    timestamp: Date.now(),
    success: false,
    errors: [],
    warnings: []
  }

  // stdout should log warnings
  script.stdout.on('data', function(data) {
    if(!complete) {
      log.warnings.push(data.toString());
    }
  });

  // stderr logs errors
  script.stderr.on('data', function(data) {
    if(!complete) {
      log.errors.push(data.toString());
    }
  });

  // Handle exit
  script.on("exit", function(code, sig) {
    complete = true;

    if(code == 0) {
      log.success = true;
    } else {
      log.errors.push("Exited with code " + code);
    }

    // Save the log
    // TODO - sensorlog table - enter that we updated readings

    // Set the timer for next time
    if(log.success) {
      // Set it to run at every [interval] mins past the hour, just for reliability
      setTimeout(function() { updateSensors() }, getMillisecondsTilMinute(config.updateSensorsMinuteInterval));
      makeLogEntry("Successfully updated sensor content", "S")
    } else {
      // If fail, retry three times, then raise an alert and wait til the next interval
      if(retry >= 2) {
        // Out of retries - raise alert
        // TODO

        makeLogEntry("Unable to update sensor content", "F")

        console.log(log);

        // Set timer to try next time
        setTimeout(function() { updateSensors() }, getMillisecondsTilMinute(config.updateSensorsMinuteInterval));
      } else {
        // Wait 30 secs and retry
        makeLogEntry("Sensor update failed - retrying...", "F")
        setTimeout(function() { updateSensors(++retry) }, 30000)
      }
    }
  });
}

//// ILI

// Source data - runs every day at 9am
function sourceILI(retry=0) {
  makeLogEntry("Sourcing ILI content - attempt " + (retry+1))

  // Call the function
  var script = spawn('python', ['../ili/data_sourcing.py'], {cwd: '../ili'});

  var complete = false;

  var log = {
    type: "source",
    timestamp: Date.now(),
    success: false,
    errors: [],
    warnings: []
  }

  // stdout should log warnings
  script.stdout.on('data', function(data) {
    if(!complete) {
      log.warnings.push(data.toString());
    }
  });

  // stderr logs errors
  script.stderr.on('data', function(data) {
    if(!complete) {
      log.errors.push(data.toString());
    }
  });

  script.on("exit", function(code, sig) {
    complete = true;
    if(code == 0) {
      log.success = true;
    } else {
      log.errors.push("Exited with code " + code);
    }

    // Save the log
    // TODO - sensorlog table - enter that we sourced content

    // Set the timer for next time
    if(log.success) {
      makeLogEntry("Successfully sourced ILI content", "S")
      // If success, set timer for tomorrow at 8am
      setTimeout(function() { sourceILI() }, getMillisecondsTilHour(config.sourceILIHour));

      // Initialise data cleaning
      cleanILI();

    } else {
      // If fail, retry twice, then raise an error and wait a day
      if(retry >= 2) {
        // Out of retries - raise alert with admin
        // TODO
        makeLogEntry("Unable to source ILI content", "F")
        // Set timer to try next time
        setTimeout(function() { sourceILI() }, getMillisecondsTilHour(config.sourceILIHour))

        // TODO REMOVE
        console.log(log);

        // Done for now - update ILI content with existing static data
        updateILI()
      } else {
        // Wait 10 secs and retry
        makeLogEntry("Failed to source ILI content - retrying...", "F")
        setTimeout(function() { sourceILI(++retry) }, 10000)
      }
    }
  });
}

// Clean data - runs after source data has successfully returned
function cleanILI(retry=0) {
  makeLogEntry("Cleaning ILI content - attempt " + (retry+1))

  // Call the function
  var script = spawn('python', ['../ili/data_cleaning.py'], {cwd: '../ili'});

  var complete = false;

  var log = {
    type: "clean",
    timestamp: Date.now(),
    success: false,
    errors: [],
    warnings: []
  }

  // stdout should log warnings
  script.stdout.on('data', function(data) {
    if(!complete) {
      log.warnings.push(data.toString());
    }
  });

  // stderr logs errors
  script.stderr.on('data', function(data) {
    if(!complete) {
      log.errors.push(data.toString());
    }
  });

  script.on("exit", function(code, sig) {
    complete = true;
    if(code == 0) {
      log.success = true;
    } else {
      log.errors.push("Exited with code " + code);
    }

    // Save the log
    // TODO - sensorlog table - enter that we sourced content

    // Set the timer for next time
    if(log.success) {
      makeLogEntry("Successfully cleaned ILI content", "S")
      // Sourced and cleaned data - update ILI
      updateILI();

    } else {
      // If fail, retry twice, then raise an error and wait a day
      if(retry >= 2) {
        // Out of retries - raise alert with admin
        // TODO
        makeLogEntry("Unable to clean ILI content", "F")
        // Done for now - update ILI content with existing static data

        console.log(log);

        updateILI()
      } else {
        // Wait 10 secs and retry
        makeLogEntry("Failed to clean ILI content - retrying...", "F")
        setTimeout(function() { cleanILI(++retry) }, 10000)
      }
    }
  });
}

// Call data - runs every 15 minutes
function updateILI(retry=0) {
  makeLogEntry("Updating ILI content - attempt " + (retry+1))

  // Call the function
  var script = spawn('python', ['../ili/data_call.py'], {cwd: '../ili'});

  var complete = false;

  var log = {
    type: "update",
    timestamp: Date.now(),
    success: false,
    errors: [],
    warnings: []
  }

  // stdout should log warnings
  script.stdout.on('data', function(data) {
    if(!complete) {
      log.warnings.push(data.toString());
    }
  });

  // stderr logs errors
  script.stderr.on('data', function(data) {
    if(!complete) {
      log.errors.push(data.toString());
    }
  });

  script.on("exit", function(code, sig) {
    complete = true;
    if(code == 0) {
      log.success = true;
    } else {
      log.errors.push("Exited with code " + code);
    }

    // Save the log
    // TODO - sensorlog table - enter that we sourced content

    // Set the timer for next time
    if(log.success) {
      makeLogEntry("Successfully updated ILI content", "S")
      // Sourced and cleaned data - update ILI
      setTimeout(function() { updateILI() }, getMillisecondsTilMinute(config.updateILIMinuteInterval));

    } else {
      // If fail, retry twice, then raise an error and wait a day
      if(retry >= 2) {
        // Out of retries - raise alert with admin
        // TODO
        makeLogEntry("Unable to update ILI content", "F")

        console.log(log);

        // Done for now - attempt to update next time
        setTimeout(function() { updateILI() }, getMillisecondsTilMinute(config.updateILIMinuteInterval));
      } else {
        // Wait 10 secs and retry
        makeLogEntry("Failed - retrying...", "F")
        setTimeout(function() { updateILI(++retry) }, 10000)
      }
    }
  });
}

//// UTIL

function getTimeRemaining(timeout) {
    return Math.ceil((timeout._idleStart + timeout._idleTimeout - Date.now()) / 1000);
}

// Given a 24-hour value for the hour, return milliseconds until then
function getMillisecondsTilHour(targetHour) {
  var now = new Date();

  // Get mins to hour
  var minsToHour = (60 - now.getMinutes());

  // Get hours to target hour
  var hoursToTarget = targetHour-(now.getHours()+1);

  // Handle the target being the next day
  if(hoursToTarget < 0) {
    hoursToTarget += 24
  }

  // Return milliseconds until target hour
  return 60000 * (minsToHour + (hoursToTarget * 60));
}

// Get milliseconds until specified minute interval past hour - keeps it reliable
// NOTE: Best to stick to factors of 60, and don't exceed 30!
function getMillisecondsTilMinute(minuteInterval) {
  var now = new Date();

  // Get mins to target
  var minsToInterval = (minuteInterval - (now.getMinutes() % minuteInterval));

  // Handle the target being the next day
  if(minsToInterval < 0) {
    minsToInterval += 60
  }

  // Return milliseconds until target hour
  return (minsToInterval * 60000);
}

function makeLogEntry(logText, pre="-") {

  var d = new Date();

  var day = d.getDate();
  if(day < 10) { day = "0" + day }

  var month = d.getMonth()+1;
  if(month < 10) { month = "0" + month }

  var hour = d.getHours();
  if(hour < 10) { hour = "0" + hour }

  var min = d.getMinutes();
  if(min < 10) { min = "0" + min }

  var fName = logMonths[d.getMonth()] + "-" + d.getFullYear() + ".log"

  var contents = day+"/"+month+" "+hour+":"+min+" "+pre+" "+logText;

  if(debug) {
    console.log(contents);
  }

  contents += "\n"

  fs.appendFile("logs/"+fName, contents, function(err) {
    if(err) {
      console.log("Error writing message log: " + err);
      return;
    }
  });

}

////////////////////////////////////////////////////////////////////////////////


//// PORTAL CALLS


//// ANALYTICS CALLS

/*
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Testing
app.get('/', (req, res) => res.send('Hello Remote!'))

app.listen(3000, () => console.log('Example app listening on port 3000!'))
*/
