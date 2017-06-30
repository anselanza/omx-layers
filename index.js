var exec = require('child_process').exec;
var path = require('path');


const DBUS_COMMAND = "bash "+__dirname+"/dbus.sh ";
const DBUS_DEST_DEFAULT = 'org.mpris.MediaPlayer2.omxplayer';

class OmxInstance {

	constructor(options) {
		this.options = options;

		if (options && options.layer) {
			this.dbusDest = DBUS_DEST_DEFAULT + '_layer' + options.layer;
			this.layer = options.layer;
			console.log('setup for layered mode');
		} else {
			this.dbusDest = DBUS_DEST_DEFAULT;
			this.layer = 1;
			console.log('not layered mode');
		}
		console.log('dbus name will be', this.dbusDest);

		exec('mkfifo omxpipe'+this.layer);

		this.defaults = null;
		this.progressHandler = null;

	}

	getLayer() {
		return this.layer;
	}

	cancelProgressHandlerIfActive() {
		if (this.progressHandler) {
			clearInterval(this.progressHandler);
			console.log('progressHandler cancelled');
		}
	}

	dbusCommand (command)  {
		let merge = "bash " +__dirname+"/dbus.sh " + this.dbusDest + " " + command;
		if (command != 'getplaystatus' && command !='getvolume' && command != 'getposition') { console.log('merge:', merge); }
		return merge;
	}

	resume () {
		exec(this.dbusCommand('getplaystatus'), (error, stdout, stderr) => {
			// Ignore if already playing
			if (stdout.indexOf("Paused")>-1) {
				this.togglePlay();
			}
		});
	}

	pause () {
		exec(this.dbusCommand('getplaystatus'), (error, stdout, stderr) => {
			// Ignore if already paused
			if (stdout.indexOf("Playing")>-1) {
				this.togglePlay();
			}
		});
	}

	stop () {
		exec(this.dbusCommand('stop'), (error, stdout, stderr) => {
			this.cancelProgressHandlerIfActive();
		});
	}

	quit () {
		exec(this.dbusCommand('quit'), (error, stdout, stderr) => {
			this.cancelProgressHandlerIfActive();
	  });
	}

	togglePlay () {
		exec(this.dbusCommand('toggleplay'), (error, stdout, stderr) => {});
	}

	seek (offset) {
		//seek offset in seconds; relative from current position; negative values will cause a jump back;
		exec(this.dbusCommand('seek ' +Math.round(offset*1000000)), (error, stdout, stderr) => {});
	}

	setPosition (position) {
		//position in seconds from start; //positions larger than the duration will stop the player;
		exec(this.dbusCommand('setposition '+Math.round(position*1000000)), (error, stdout, stderr) => {});
	}

	setVolume (volume) {
		// volume range [0.0, 1.0];
		if (volume > 0 && volume < 1.0) {
			exec(this.dbusCommand('setvolume '+volume), (error, stdout, stderr) => {});
		}
	}

	setVisibility (visible) {
		let command = visible ? 'unhidevideo' : 'hidevideo';
		exec(this.dbusCommand(command), (err, stdout, stderr) => {});
	}

	setAlpha (alpha) {
		exec(this.dbusCommand('setalpha ' + alpha), (err, stdout, stderr) => {});
	}

	getCurrentPosition () {
		console.log('getCurrentPosition');
		exec(this.dbusCommand('getposition'), (error, stdout, stderr) => {
			console.log('getposition error, stdout, stderr:', error, stdout, stderr);
			if (error) return null;
			let position = parseInt(stdout);
			console.log('currentPosition:', position, 'or in seconds:', position / 1000);
			return position;
	  });
	}

	getIsPlaying () {
		console.log('getIsPlaying');
		exec(this.dbusCommand('getplaystatus'), (error, stdout, stderr) => {
			console.log('getplaystatus error, stdout, stderr:', error, stdout, stderr);
			if (error) {
				console.error('error getting play status:', err);
				return null;
			}
			if (stdout == 'Playing') {
				return true;
			} else {
				return false;
			}
	  });
	}

	getDuration () {
		exec( this.dbusCommand('getduration'), (error, stdout, stderr) => {
			if (error) return null;
			let duration = parseInt(stdout);
			console.log('getDuration:', duration, 'or in seconds:', duration / 1000);
    	// let duration = Math.round(Math.max(0,Math.round(parseInt(stdout.substring((stdout.indexOf("int64")>-1 ? stdout.indexOf("int64")+6:0)))/10000)/100));

	  });
	}

	getVolume () {
		exec(this.dbusCommand('getvolume'), (error, stdout, stderr) => {
			if (error) return null;
			let volume = parseFloat(stdout);
			console.log('getVolume:', volume);
		});	}

	onProgress (callback) {
		console.log('add new progress handler for layer', this.layer);
		this.progressHandler = setInterval( () => {
			if(this.getIsPlaying()){
				callback({'position': this.getCurrentPosition(), 'duration': this.getDuration()});
			} else {
				callback({ 'playing': false });
			}
		}, 1000);
	}

	onStart (callback) {
		console.log('onStart event');
		if (callback) {
			callback();
		}
	}

	waitTillPlaying (callback) {
		console.log('waitTillPlaying');
		let countAttempts = 0;
		let interval;
		interval = setInterval( () => {
			countAttempts++;
			exec(this.dbusCommand('getplaystatus'), (error, stdout, stderr) => {
				if (error) {
					console.log('error on getplaystus:', error);
				} else {
					console.log('getplaystatus result after', countAttempts, ':', stdout);
					clearInterval(interval);
					callback();
				}
			});
		}, 1000);
	}

	open (path, doneCallback, holdMode) {
		console.log('OmxInstance open() for layer #', this.layer, 'holdMode?', holdMode);
		let settings = this.options || {};
		let args = [];
		let command = 'omxplayer';

		args.push('"'+path+'"');

		if (['hdmi','local','both'].indexOf(settings.audioOutput) != -1) {
			args.push('-o');
			args.push(settings.audioOutput);
		}

		if (settings.blackBackground !== false) { // defaults to true
			args.push('-b');
		}

		if (settings.disableKeys === true) { //defaults to  false
			args.push('--no-keys')
		}

		if (settings.disableOnScreenDisplay === true) { //defaults to  false
			args.push('--no-osd')
		}

		if (settings.disableGhostbox === true) { //defaults to  false
			args.push('--no-ghost-box');
		}

		if (settings.loop === true) { // defaults to false
			args.push('--loop');
		}

		if (settings.subtitlePath && settings.subtitlePath != "" ){
			args.push('--subtitles');
			args.push('"'+settings.subtitlePath+'"');
		}

		if (settings.startAt){
			args.push('--pos');
			args.push(''+settings.startAt+'');
		}

		if (settings.layer) {
			args.push('--layer');
			args.push(settings.layer);
		}

		if (holdMode) {
			args.push('--alpha');
			args.push(0);
		}

		args.push('--dbus_name');
		args.push(this.dbusDest);

		let finalOpenCommand = command+' '+args.join(' ')+' < omxpipe'+this.layer;
		console.log('finalOpenCommand:', finalOpenCommand);

	  exec(finalOpenCommand, (error, stdout, stderr) => {
			doneCallback();
			console.log('omxpipe done for layer', this.layer);
  		this.cancelProgressHandlerIfActive();
	  	console.log(stdout);
	  });
	  exec(' . > omxpipe'+this.layer, (error, stdout, stderr) => {
			this.waitTillPlaying( () => {
				console.log('started ok');
				this.onStart();
				if (holdMode) {
					console.log('holdMode ON, so immediately pause and hide');
					this.pause();
					this.setVisibility(false);
				}
			});
		});

	}

}

module.exports = OmxInstance;
