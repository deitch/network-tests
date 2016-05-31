/*jslint node:true, esversion:6 */

var fs = require('fs'), Packet = require('packet-api'), async = require('async'), _ = require('lodash'), 
ssh = require('simple-ssh'), keypair = require('keypair'), forge = require('node-forge'), jsonfile = require('jsonfile'),
argv = require('minimist')(process.argv.slice(2));

// import the token from the file token
const TOKEN = fs.readFileSync('token').toString().replace(/\n/,''), pkt = new Packet(TOKEN),
SSHFILE = './keys',
PROJDATE = new Date().toISOString(),
projName = "ULL-network-performance-test-"+PROJDATE,
SIZES = [300,500,1024,2048],
PROTOCOLS = ['TCP','UDP'],
CHECKDELAY = 30,
NETSERVERHOSTPORT = 7001,
NETSERVERCONTAINERPORT = 7002,
REPETITIONS = 50000
;


const runHostTests = function (tests,cb) {
	// this must be run in series so they don't impact each other
	async.eachSeries(tests,function (t,cb) {
		let msg = "benchmark test: local "+t.protocol+" "+t.size, target = devices[t.to].ip_private.address;
		log(t.server+": running "+msg);
		// get the private IP for the device
		var session = new ssh({
			host: devices[t.server].ip_private.address,
			user: "root",
			key: pair.private
		});
		session.exec('netperf -H '+target+' -c -t '+t.protocol+'_RR -l -'+t.reps+' -v 2 -p '+t.port+' -- -r '+t.size+','+t.size, {
			exit: function (code) {
				if (code !== 0) {
					session.end();
					cb(t.server+": Failed to start host netserver");
				}
			}
		})
		;
		session.on('error',function (err) {
			log(t.server+": ssh error connecting for "+msg);
			log(err);
			session.end();
			cb(t.server+": ssh connection failed");
		});
		session.on('close',function () {
			log(t.server+": test complete: "+msg);
			cb(null);
		});
		session.start();
	},function (err) {
		cb(err);
	});
},

log = function (msg) {
	let m = typeof(msg) === 'object' ? JSON.stringify(msg) : msg;
	console.log(new Date().toISOString()+": "+m);
},
devices = {
	source1: {
		type: 1,
		purpose: "source"
	},
	source3: {
		type: 3,
		purpose: "source"
	},
	target1: {
		type: 1,
		purpose: "target"
	},
	target3: {
		type: 3,
		purpose: "target"
	}
}
;

// use command line args to determine
// - if to install software
// - if to run tests
// - if to destroy project
// default:
//		software: install
//		tests: run
var projId = argv.project || null,
activeTypes = [].concat(argv.type || []),
activeDevs = _.reduce(devices,function (active,value,item) {
	if (activeTypes.length === 0 || _.indexOf(activeTypes,value.type) > -1) {
		active[item] = value;
	}
	return active;
},{}),
pair,
keepItems = argv.keep || false,
activeProtocols = [].concat(argv.protocol || PROTOCOLS)
;

log("using devices:");
log(_.keys(activeDevs));



if (argv.help || argv.h) {
	console.log("Usage:");
	console.log(process.argv[1]+" [OPTIONS]");
	console.log();
	console.log("OPTIONS:");
	console.log("\t--help, -h: show this help");
	console.log("\t--type <type>: use only servers of type <type>, normally 1 or 3. Default is to use all types.");
	console.log("\t--project <project>: use existing project ID <project> instead of creating new one");
	console.log("\t--keep: do not destroy servers or project at end of test run");
	process.exit(1);
}




// get the public key in the right format
if (fs.existsSync(SSHFILE)) {
	pair = jsonfile.readFileSync(SSHFILE);
} else {
	pair = keypair();
	pair.sshPublicKey = forge.ssh.publicKeyToOpenSSH(forge.pki.publicKeyFromPem(pair.public),"ULL-test-user@atomicinc.com");
	jsonfile.writeFileSync(SSHFILE,pair);
}


async.waterfall([
	// if asked for existing project, see if it exists
	function (cb) {
		if (projId) {
			pkt.getProjects(projId,{},function (err,data) {
				if (err || !data || !data.id) {
					let msg = "FAIL: cannot use project "+projId+" which does not exist";
					log(msg);
					cb(msg);
				} else {
					cb(null);
				}
			});
		} else {
			cb(null);
		}
	},
	// create a new project
	function (cb) {
		if (!projId) {
			log("creating new project");
			pkt.addProject({name:projName},cb);
		} else {
			log("reusing existing project");
			cb(null,{id:projId});
		}
	},
	// check if this keypair exists or add it
	function (res,cb) {
		projId = res.id;
		log("project ready: "+projId);
		pkt.getSshkeys(false,cb);
	},
	function (res,cb) {
		// check for our key
		let existingKey = _.find(res.ssh_keys,{key:pair.sshPublicKey});
		if (existingKey) {
			pair.id = existingKey.id;
			log("ssh key already in system: "+pair.id);
			cb(null);
		} else {
			log("key not in system, adding");
			// now install the key as a new key for this user
			pkt.addSshkey({label: "temporary key for "+projName,key:pair.sshPublicKey}, function (err,data) {
				if (err) {
					log("failed to install ssh public key");
				} else {
					pair.id = data.id;
					log("installed ssh key "+pair.id);
				}
				cb(err);
			});
		}
	},
	// get the existing hosts for this project
	function (cb) {
		log("checking existing devices");
		pkt.getDevices(projId,false,{},cb);
	},
	// add the devices we need unless they already exist
	function (res,cb) {
		log("making new devices if needed");
		let devsToCreate = _.keys(activeDevs);
		// see if it already exists
		var existing = _.map(res.devices,"hostname");
		async.each(devsToCreate,function (item,callback) {
			if (_.indexOf(existing,item) > -1) {
				log(item+": already exists");
				callback(null);
			} else {
				//closure to handle each correctly
				(function(item) {
					log("creating "+item);
					pkt.addDevice(projId,{hostname: item, plan: "baremetal_"+devices[item].type, facility: "ewr1", operating_system:"centos_7"},function (err,data) {
						if(err) {
							log(item+": error creating");
							log(err);
							log(data);
						} else {
							log(item+": created");
							devices[item].id = data.id;
						}
						callback(err);
					});
				})(item);
			}
		},cb);
	},
	// wait for all servers to be ready
	function (cb) {
		log("all servers ready");
		// how do we wait for all the devices to be ready?
		// we check the state of each one until it is ready
		log("waiting for all devices to be ready");
		var waitingFor = _.keys(activeDevs).length;
		async.whilst(
			function () {return waitingFor > 0;},
			function (callback) {
				// check each device
				// only check those that are not ready
				let devsToCheck = _.keys(_.omitBy(activeDevs,{ready:true}));
				log("checking "+devsToCheck.join(","));
				pkt.getDevices(projId,false,{},function (err,data) {
					// check each device and see its state
					if (err) {
						log("error retrieving all devices");
						callback(err);
					} else {
						_.each(devsToCheck,function (name) {
							let item = _.find(data.devices,{hostname:name});
							if (item && item.state && item.state === "active" && name && !devices[name].ready) {
								log(name+ " ready");
								// save my private IP
								devices[name].ip_public = _.find(item.ip_addresses, {public:true,address_family:4});
								devices[name].ip_private = _.find(item.ip_addresses, {public:false,address_family:4});
								devices[name].ready = true;
								waitingFor--;
							}
						});
						if (waitingFor > 0) {
							log("waiting "+CHECKDELAY+" seconds to check servers");
							setTimeout(function () {
								callback();
							},CHECKDELAY*1000);
						} else {
							callback();
						}
					}
				});
			},
			function (err) {
				if (err) {
					log("error checking server status");
				} else {
					log("all devices ready");
				}
				cb(err);
			}
		);
	},
	// install necessary software
	function (cb) {
		log("installing software");
		async.each(_.keys(activeDevs), function (item,cb) {
			// get the private IP for the device
			let ipaddr = devices[item].ip_public.address;
			log(item+": installing software on "+ipaddr);
			var session = new ssh({
				host: ipaddr,
				user: "root",
				key: pair.private
			});
			session
				.exec('yum install -y git',{
					exit: function (code) {
						if (code !== 0) {
							session.end();
							cb(item+": Failed to install git");
						}
					}
				})
				.exec('git clone git://github.com/deitch/network-tests',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to clone deitch/network-tests");
							session.end();
						}
					}
				})
				.exec('network-tests/installnetperf.sh',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to install netperf");
							session.end();
						}
					}
				})
				.exec('curl -fsSL https://get.docker.com/ | sh',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to install docker");
							session.end();
						}
					}
				})
				.exec('service docker start',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to start docker");
							session.end();
						}
					}
				})
				.exec('docker build -t netperf network-tests/image',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to build netperf image");
							session.end();
						}
					}
				})
				;
				session.on('error',function (err) {
					log(item+": error install software");
					log(err);
					session.end();
					cb(item+": ssh connection failed");
				})
				.on('close',function () {
					log(item+": complete");
					cb(null);
				});
				session.start();
		}, function (err) {
			if (err) {
				log("failed to install software");
			} else {
				log("software installed in all servers");
			}
			cb(err);
		});		
	},
	// start the reflectors on the targets
	function (cb) {
		let targets = _.keys(_.pickBy(activeDevs,{purpose:"target"}));
		log("starting netserver on "+targets.join(","));
		async.each(targets, function (item,cb) {
			log(item+": starting host netserver");
			// get the private IP for the device
			var session = new ssh({
				host: devices[item].ip_public.address,
				user: "root",
				key: pair.private
			});
			session.exec('pgrep netserver || netserver -p '+NETSERVERHOSTPORT,{
				exit: function (code) {
					if (code !== 0) {
						session.end();
						cb(item+": Failed to start host netserver");
					}
				}
			})
			// start the netserver container
			.exec('docker run -d netperf netserver -D -p '+NETSERVERCONTAINERPORT,{
				exit: function (code) {
					if (code !== 0) {
						session.end();
						cb(item+": Failed to start container netserver");
					}
				}
			});
			session.on('error',function (err) {
				log(item+": error start reflector");
				log(err);
				session.end();
				cb(item+": ssh connection failed");
			});
			session.on('close',function () {
				log(item+": netserver started");
				cb(null);
			});
			session.start();
		}, function (err) {
			if (err) {
				log("failed to start netperf netserver");
			} else {
				log("started all target netperf netservers");
			}
			cb(err);
		});		
		
	},
	// run all of our tests
	
	// first run our benchmark tests
	function (cb) {
		// make the list of what we will test
		let tests = [];
		_.each(activeProtocols,function (proto) {
			_.each(SIZES, function (size) {
				_.each(_.keys(_.pickBy(activeDevs,{purpose:"target"})),function (dev) {
					// local tests
					tests.push({from:dev, to:dev, port:NETSERVERHOSTPORT, reps: REPETITIONS, size: size, protocol: proto});
					// remote tests
					tests.push({from:dev.replace('target','source'), to:dev, port:NETSERVERHOSTPORT, reps: REPETITIONS, size: size, protocol: proto});
				});
			});
		});
		runHostTests(tests,cb);
	},
	// and capture the output
	function (cb) {
		log("running tests");
		cb(null,null);
	},
	// destroy all hosts
	function (res,cb) {
		if (keepItems) {
			log("command-line flag not to destroy servers");
			cb(null,false);
		} else {
			log("destroying servers");
			async.each(_.keys(activeDevs), function (item,callback) {
				pkt.removeDevice(devices[item].id,function (err) {
					if (!err) {
						log(item +" removed");
					} else {
						log(item+ " removal failed! Please check console");
						log(err);
					}
					// always callback without error, since we want the other devices removed too
					callback(err);
				});
			},function (err) {
				if (err) {
					log("err destroying devices. Please check on Packet console to avoid unnecessary charges.");
					cb(err);
				} else {
					log("all devices destroyed");
					cb(null,true);
				}
			});
		}
	},
	// destroy the project
	function (res,cb) {
		if (res) {
			log("destroying project");
			pkt.removeProject(projId,function (err) {
				if (err) {
					log("err destroying project "+projId+". Please check on Packet console.");
				} else {
					log("project "+projId+" destroyed");
				}
				cb(null,true);
			});
		} else {
			log("not destroying project as servers not destroyed");
			cb(null,false);
		}
	},
	// destroy the ssh key
	function (res,cb) {
		if (res) {
			log("removing ssh key");
			pkt.removeSshkey(pair.id,function (err) {
				if (err) {
					log("err removing ssh key "+pair.id+". Please check on Packet console.");
				} else {
					log("ssh key "+pair.id+" removed");
				}
				cb(null);
			});
		} else {
			log("not removing ssh key as project not destroyed");
			cb(null);
		}
	}
	
],function (err) {
	log("test run complete");
	if (err) {
		log(err);
	}
});

