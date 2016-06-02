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
TESTS = ["metal","bridge","host"],
CHECKDELAY = 30,
NETSERVERPORT = 7002,
NETSERVERDATAPORT = 7003,
NETSERVERLOCALPORT = 7004,
REPETITIONS = 50000,

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
};

const runHostTests = function (tests,callback) {
	// need to start the reflector container on each target
	// find all of the targets
	let targets = _.uniq(_.map(tests,"to")), targetIds = {}, allResults;
	
	// three steps:
	// 1- start reflectors
	// 2- run tests
	// 3- stop reflectors
	async.series([
		function (cb) {
			// now start the reflector on each
			let errCode = false;
			async.each(targets,function (target,cb) {
				targetIds[target] = {};
				var session = new ssh({
					host: devices[target].ip_public.address,
					user: "root",
					key: pair.private
				});
				// start the netserver container
				session.exec('netserver -p '+NETSERVERPORT+' && pgrep netserver',{
					exit: function (code) {
						if (code !== 0) {
							errCode = true;
							session.end();
							cb(target+": Failed to start netserver");
						}
					},
					out: function (stdout) {
						targetIds[target].id = stdout.replace(/\n/,'').replace(/\s+/,'');
						targetIds[target].ip = devices[target].ip_private.address;
					}
				});
				session.on('error',function (err) {
					log(target+": ssh error connecting to start netserver");
					log(err);
					session.end();
					cb(target+": ssh connection failed");
				});
				session.on('close',function (hadError) {
					if (!hadError && !errCode) {
						log(target+": netserver started "+targetIds[target].id);
						cb(null);
					}
				});
				session.start();
			},function (err) {
				cb(err);
			});
		},
		function (cb) {
			// this must be run in series so they don't impact each other
			async.mapSeries(tests,function (t,cb) {
				let msg = "benchmark test: "+t.type+" "+t.protocol+" "+t.size, target = targetIds[t.to].ip, output,
				errCode = false;
				log(t.from+": running "+msg);
				// get the private IP for the device
				var session = new ssh({
					host: devices[t.from].ip_public.address,
					user: "root",
					key: pair.private
				});
				session.exec('netperf  -P 0 -H '+target+' -c -t '+t.protocol+'_RR -l -'+t.reps+' -v 2 -p '+t.port+' -- -k -r '+t.size+','+t.size+' -P '+NETSERVERLOCALPORT+','+NETSERVERDATAPORT, {
					exit: function (code) {
						if (code !== 0) {
							log(t.from+": Failed to start run netperf");
							errCode = true;
							session.end();
						}
					},
					out: function (stdout) {
						output = stdout;
					}
				})
				;
				session.on('error',function (err) {
					log(t.from+": ssh error connecting for "+msg);
					log(err);
					session.end();
					cb(t.from+": ssh connection failed");
				});
				session.on('close',function (hadError) {
					if (!hadError && !errCode) {
						log(t.from+": test complete: "+msg);
						cb(null,_.extend({},t,{results:output}));
					}
				});
				session.start();
			},function (err,data) {
				allResults = data;
				cb(err);
			});
		},
		function (cb) {
			// stop the netserver reflectors
			async.each(targets,function (target,cb) {
				let errCode = false;
				var session = new ssh({
					host: devices[target].ip_public.address,
					user: "root",
					key: pair.private
				});
				// stop the netserver container
				session.exec('kill '+targetIds[target].id,{
					exit: function (code) {
						if (code !== 0) {
							errCode = true;
							session.end();
							cb(target+": Failed to stop netserver "+targetIds[target].id);
						}
					}
				});
				session.on('error',function (err) {
					log(target+": ssh error connecting to stop netserver");
					log(err);
					session.end();
					cb(target+": ssh connection failed");
				});
				session.on('close',function (hadError) {
					if (!hadError && !errCode) {
						log(target+": netserver stopped "+targetIds[target].id);
						cb(null);
					}
				});
				session.start();
			},function (err) {
				cb(err);
			});
		}
	],function (err) {
		callback(err,allResults);
	});
},

runContainerTests = function (tests,nettype,callback) {
	// need to start the reflector container on each target
	
	// find all of the targets
	let targets = _.uniq(_.map(tests,"to")), targetIds = {}, netarg = nettype ? '--net='+nettype : '', allResults;
	
	// three steps:
	// 1- start reflectors
	// 2- run tests
	// 3- stop reflectors
	
	async.series([
		function (cb) {
			// now start the reflector on each
			async.each(targets,function (target,cb) {
				targetIds[target] = {};
				let errCode = false;
				var session = new ssh({
					host: devices[target].ip_public.address,
					user: "root",
					key: pair.private
				});
				// start the netserver container
				let portline = '-p '+NETSERVERPORT+':'+NETSERVERPORT+' -p '+NETSERVERDATAPORT+':'+NETSERVERDATAPORT+' -p '+NETSERVERDATAPORT+':'+NETSERVERDATAPORT+'/udp';
				session.exec('docker run '+portline+' '+netarg+' -d --name=netserver netperf netserver -D -p '+NETSERVERPORT,{
					exit: function (code,stdout) {
						if (code !== 0) {
							errCode = true;
							session.end();
							cb(target+": container netserver");
						} else {
							targetIds[target].id = stdout.replace(/\n/,'').replace(/\s+/,'');
						}
					}
				})
				.exec("docker inspect --format '{{ .NetworkSettings.IPAddress }}' netserver",{
					exit: function (code,stdout) {
						if (code !== 0) {
							errCode = true;
							session.end();
							cb(target+": Failed to get container netserver IP");
						} else {
							// if it has no IP, go for localhost
							let ip = stdout.replace(/\n/,'').replace(/\s+/,'');
							targetIds[target].ip = ip && ip !== "" ? ip : 'localhost';
						}
					}
				})
				;
				session.on('error',function (err) {
					log(target+": ssh error connecting to start netserver container");
					log(err);
					session.end();
					cb(target+": ssh connection failed");
				});
				session.on('close',function (hadError) {
					if (!hadError && !errCode) {
						log(target+": netserver container started "+targetIds[target].id);
						cb(null);
					}
				});
				session.start();
			},function (err) {
				cb(err);
			});
		},
		function (cb) {
			// this must be run in series so they don't impact each other
			async.mapSeries(tests,function (t,cb) {
				let msg = "container test: "+t.type+" "+t.protocol+" "+t.size, output,
				target = t.type === "remote" ? devices[t.to].ip_private.address : targetIds[t.to].ip,
				errCode = false;
				log(t.from+": running "+msg);
				// get the private IP for the device
				let session = new ssh({
					host: devices[t.from].ip_public.address,
					user: "root",
					key: pair.private
				}), dockerCmd = 'docker run --rm '+netarg+' netperf netperf -P 0 -H '+target+' -c -t '+t.protocol+'_RR -l -'+t.reps+' -v 2 -p '+t.port+' -- -k -r '+t.size+','+t.size+' -P '+NETSERVERLOCALPORT+','+NETSERVERDATAPORT;
				//log(dockerCmd);
				session.exec(dockerCmd, {
					exit: function (code) {
						if (code !== 0) {
							errCode = true;
							session.end();
							cb(t.from+": Failed to start host netperf");
						}
					},
					out: function (stdout) {
						output = stdout;
					}
				})
				;
				session.on('error',function (err) {
					log(t.from+": ssh error connecting for "+msg);
					log(err);
					session.end();
					cb(t.from+": ssh connection failed");
				});
				session.on('close',function (hadError) {
					if (!hadError && !errCode) {
						log(t.from+": test complete: "+msg);
						// save the results from this test
						cb(null,_.extend({},t,{results:output}));
					}
				});
				session.start();
			},function (err,data) {
				allResults = data;
				cb(err);
			});
		},
		function (cb) {
			// stop the netserver reflectors
			async.each(targets,function (target,cb) {
				let errCode = false;
				var session = new ssh({
					host: devices[target].ip_public.address,
					user: "root",
					key: pair.private
				});
				// stop the netserver container
				session.exec('docker stop netserver && docker rm netserver',{
					exit: function (code) {
						if (code !== 0) {
							errCode = true;
							session.end();
							cb(target+": Failed to stop and rm container netserver");
						}
					}
				});
				session.on('error',function (err) {
					log(target+": ssh error connecting to stop netserver container");
					log(err);
					session.end();
					cb(target+": ssh connection failed");
				});
				session.on('close',function (hadError) {
					if (!hadError && !errCode) {
						log(target+": netserver container stopped");
						cb(null);
					}
				});
				session.start();
			},function (err) {
				cb(err);
			});
		}
	],function (err) {
		callback(err,allResults);
	});
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
activeTypes = _.uniq([].concat(argv.type || [])),
activeDevs = _.reduce(devices,function (active,value,item) {
	if (activeTypes.length === 0 || _.indexOf(activeTypes,value.type) > -1) {
		active[item] = value;
	}
	return active;
},{}),
pair,
keepItems = argv.keep || false,
activeProtocols = _.uniq([].concat(argv.protocol || PROTOCOLS)),
activeSizes = _.uniq([].concat(argv.size || SIZES)),
activeTests = _.uniq([].concat(argv.test || TESTS)),
totalResults = []
;

if (argv.help || argv.h) {
	const msg = `

Usage:
${process.argv[1]} [OPTIONS]

OPTIONS:
	--help, -h: show this help
	--type <type>: use only servers of type <type>, normally 1 or 3. May be invoked multiple times. Default is all types.
	--protocol <protocol>: test only protocol <protocol>, normally UDP or TCP. May be invoked multiple times. Default is all of: ${PROTOCOLS.join(" ")}
	--size <size>: test packets of size <size>, an integer. May be invoked multiple times. Default is all of: ${SIZES.join(" ")}
	--test <test>: test to perform. May be invoked multiple times. Default is all of: ${TESTS.join(" ")}
	--project <project>: use existing project ID <project> instead of creating new one
	--keep: do not destroy servers or project at end of test run
	`
	;
	console.log(msg);
	process.exit(1);
}

log(`using devices: ${_.keys(activeDevs).join(" ")}`);
log(`using packet sizes: ${activeSizes.join(" ")}`);
log(`using protocols: ${activeProtocols.join(" ")}`);
log(`using tests: ${activeTests.join(" ")}`);



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
				.exec('if [[ -d network-tests/.git ]]; then cd network-tests && git pull origin master; else git clone git://github.com/deitch/network-tests; fi',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to clone deitch/network-tests");
							session.end();
						}
					}
				})
				.exec('network-tests/scripts/installnetperf.sh',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to install netperf");
							session.end();
						}
					}
				})
				.exec('network-tests/scripts/installdocker.sh',{
					exit: function (code) {
						if (code !== 0) {
							log(item+": Failed to install docker");
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
				.on('close',function (hadError) {
					if (!hadError) {
						log(item+": complete");
						cb(null);
					}
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
	// run all of our tests
	
	// first run our benchmark bare metal tests
	function (cb) {
		if (_.indexOf(activeTests,"metal") > -1) {
			log("running metal tests");
			// make the list of what we will test
			let tests = [];
			_.each(activeProtocols,function (proto) {
				_.each(activeSizes, function (size) {
					_.each(_.keys(_.pickBy(activeDevs,{purpose:"target"})),function (dev) {
						// local tests
						tests.push({test: "metal", type: "local", from:dev, to:dev, port:NETSERVERPORT, reps: REPETITIONS, size: size, protocol: proto});
						// remote tests
						tests.push({test: "metal", type: "remote", from:dev.replace('target','source'), to:dev, port:NETSERVERPORT, reps: REPETITIONS, size: size, protocol: proto});
					});
				});
			});
			runHostTests(tests,cb);
		} else {
			log("skipping metal tests");
			cb(null,null);
		}
	},
	// and capture the output
	function (results,cb) {
		// save the results
		log("host tests complete");
		totalResults.push.apply(totalResults,results||[]);


		if (_.indexOf(activeTests,"bridge") > -1) {
			// now run container with net=host tests
			log("running net=bridge tests");
			// make the list of what we will test
			let tests = [];
			_.each(activeProtocols,function (proto) {
				_.each(activeSizes, function (size) {
					_.each(_.keys(_.pickBy(activeDevs,{purpose:"target"})),function (dev) {
						// local tests
						tests.push({test: "bridge", type: "local", from:dev, to:dev, port:NETSERVERPORT, reps: REPETITIONS, size: size, protocol: proto});
						// remote tests
						tests.push({test: "bridge", type: "remote", from:dev.replace('target','source'), to:dev, port:NETSERVERPORT, reps: REPETITIONS, size: size, protocol: proto});
					});
				});
			});
			runContainerTests(tests,'bridge',cb);
		} else {
			log("skipping net=bridge tests");
			cb(null,null);
		}
	},
	function (results,cb) {
		log("net=bridge tests complete");
		totalResults.push.apply(totalResults,results||[]);

		if (_.indexOf(activeTests,"host") > -1) {
			// now run container with net=host tests
			log("running net=host tests");
			// make the list of what we will test
			let tests = [];
			_.each(activeProtocols,function (proto) {
				_.each(activeSizes, function (size) {
					_.each(_.keys(_.pickBy(activeDevs,{purpose:"target"})),function (dev) {
						// local tests
						tests.push({test: "host", type: "local", from:dev, to:dev, port:NETSERVERPORT, reps: REPETITIONS, size: size, protocol: proto});
						// remote tests
						tests.push({test: "host", type: "remote", from:dev.replace('target','source'), to:dev, port:NETSERVERPORT, reps: REPETITIONS, size: size, protocol: proto});
					});
				});
			});
			runContainerTests(tests,'host',cb);
		} else {
			log("skipping net=host tests");
			cb(null,null);
		}
	},
	// destroy all hosts
	function (results,cb) {
		log("net=host tests complete");
		totalResults.push.apply(totalResults,results||[]);


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
	} else {
		//console.log(totalResults);
	}
});

