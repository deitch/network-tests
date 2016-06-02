/*jslint node:true, esversion:6 */

var fs = require('fs'), Packet = require('packet-api'), async = require('async'), _ = require('lodash'), 
scp = require('scp2'), CIDR = require('cidr-js'),
ssh = require('simple-ssh'), keypair = require('keypair'), forge = require('node-forge'), jsonfile = require('jsonfile'),
argv = require('minimist')(process.argv.slice(2));

// import the token from the file token
const TOKEN = fs.readFileSync('token').toString().replace(/\n/,''), pkt = new Packet(TOKEN),
PacketAugmenters = (function(){
	function getIpsUrl(projectId, id, action) {
	    if (id) {
	        return '/ips/' + (id + '/' || '') + (action || '');
	    }
	    if (projectId) {
	        return '/projects/' + projectId + '/ips/';
	    }
	    return false;
	}
	function getDevicesIpsUrl(device) {
      return '/devices/' + device + '/ips/';
	}
	
	return {
		getIps: function(projectId, id, parameters, callback) {
		    var path = getIpsUrl(projectId, id);
		    this._get(path, parameters, function(err, body) {
		        callback(err, body);
		    });
		},
		assignIp: function(device, ip, callback) {
		    var path = getDevicesIpsUrl(device);
		    this._post(path, ip, function(err, body) {
		        callback(err, body);
		    });
		}
	};
}()),
augmentPacket = function (proto,augmenters) {
	_.each(augmenters,function (value,key) {
		if (!proto[key]) {
			proto[key] = value;
		}
	});
	return proto;
},
SSHFILE = './keys',
PROJDATE = new Date().toISOString(),
projName = "ULL-network-performance-test-"+PROJDATE,
SIZES = [300,500,1024,2048],
PROTOCOLS = ['TCP','UDP'],
TESTS = fs.readdirSync('./upload/tests'),
NETWORKS = ["local","remote"],
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

const genTestList = function (params) {
	let tests = [];
	_.each(params.protocols,function (proto) {
		_.each(params.sizes, function (size) {
			_.each(params.networks, function (nettest) {
				_.each(_.keys(_.pickBy(params.devices,{purpose:"target"})),function (dev) {
					let from = nettest === "local" ? dev : dev.replace('target','source');
					tests.push({test: params.test, type: nettest, from:from, to:dev, port:params.port, reps: params.reps, size: size, protocol: proto});
				});
			});
		});
	});
	return tests;
},


startReflectors = function (targets,test,callback) {
	let targetIds = {};
	// now start the reflector on each
	async.each(targets,function (target,cb) {
		let errCode = false;
		targetIds[target] = {};
		var session = new ssh({
			host: devices[target].ip_public.address,
			user: "root",
			key: pair.private
		});
		// start the netserver container
		log(`network-tests/tests/${test}/start-reflector.sh ${NETSERVERPORT} ${NETSERVERDATAPORT}`);
		session.exec(`network-tests/tests/${test}/start-reflector.sh ${NETSERVERPORT} ${NETSERVERDATAPORT}`,{
			exit: function (code,stdout) {
				if (code !== 0) {
					errCode = true;
					session.end();
					cb(target+": Failed to start netserver");
				} else {
					targetIds[target].id = stdout.replace(/\n/,'').replace(/\s+/,'');
				}
				targetIds[target].ip = devices[target].ip_private_mgmt;
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
		if(err) {
			callback(err);
		} else {
			callback(null,targetIds);
		}
	});
},

getReflectorIp = function (targets,test,callback) {
	let ips = {};
	// now start the reflector on each
	async.each(targets,function (target,cb) {
		let errCode = false;
		var session = new ssh({
			host: devices[target].ip_public.address,
			user: "root",
			key: pair.private
		});
		// get the reflector IP

		session.exec(`network-tests/tests/${test}/get-reflector-ip.sh`,{
			exit: function (code,stdout) {
				if (code !== 0) {
					errCode = true;
					session.end();
					cb(target+": Failed to get netserver IP");
				} else {
					// if it has no IP, go for localhost
					let ip = stdout.replace(/\n/,'').replace(/\s+/,'');
					ips[target] = ip && ip !== "" ? ip : 'localhost';
				}
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
				log(target+": retrieved netserver IP "+ips[target]);
				cb(null);
			}
		});
		session.start();
	},function (err) {
		if(err) {
			callback(err);
		} else {
			callback(null,ips);
		}
	});
},

runTests = function (tests,targets,msgPrefix,callback) {
	// this must be run in series so they don't impact each other
	async.mapSeries(tests,function (t,cb) {
		let msg = msgPrefix+" test: "+t.type+" "+t.protocol+" "+t.size, output,
		target = t.type === "remote" ? devices[t.to].ip_private_mgmt : targets[t.to].ip,
		errCode = false;
		log(t.from+": running "+msg);
		// get the private IP for the device
		let session = new ssh({
			host: devices[t.from].ip_public.address,
			user: "root",
			key: pair.private
		}), 
		cmd = `network-tests/tests/${t.test}/run-test.sh  ${target} ${t.protocol} ${t.reps} ${t.port} ${t.size} ${NETSERVERLOCALPORT} ${NETSERVERDATAPORT}`;
		session.exec(cmd, {
			exit: function (code,stdout) {
				if (code !== 0) {
					errCode = true;
					session.end();
					cb(t.from+": Failed to start netperf");
				} else {
					output = stdout;
				}
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
	},callback);
},

stopReflectors = function (targets,test,callback) {
	// stop the netserver reflectors
	async.each(_.keys(targets),function (target,cb) {
		let errCode = false;
		var session = new ssh({
			host: devices[target].ip_public.address,
			user: "root",
			key: pair.private
		});
		// stop the netserver container
		session.exec(`network-tests/tests/${test}/stop-reflector.sh`,{
			exit: function (code) {
				if (code !== 0) {
					errCode = true;
					session.end();
					cb(target+": Failed to stop netserver "+targets[target].id);
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
				log(target+": netserver stopped "+targets[target].id);
				cb(null);
			}
		});
		session.start();
	},callback);
},


runHostTests = function (tests,callback) {
	// find all of the targets
	let targets = _.uniq(_.map(tests,"to")), targetIds = {}, allResults;
	
	// three steps:
	// 1- start reflectors
	// 2- run tests
	// 3- stop reflectors
	async.waterfall([
		function (cb) {
			startReflectors(targets,'metal',cb);
		},
		function (res,cb) {
			targetIds = res;
			runTests(tests,targetIds,"benchmark",cb);
		},
		function (res,cb) {
			allResults = res;
			stopReflectors(targetIds,"metal",cb);
		}
	],function (err) {
		callback(err,allResults);
	});
},

runContainerTests = function (tests,test,callback) {
	// need to start the reflector container on each target
	
	// find all of the targets
	let targets = _.uniq(_.map(tests,"to")), targetIds = {}, allResults;
	
	// 1- create networks, if needed
	// 2- start reflectors
	// 3- run tests
	// 4- stop reflectors
	// 5- remove networks
	
	async.waterfall([
		function (cb) {
			startReflectors(targets,test,cb);
		},
		function (res,cb) {
			targetIds = res;
			getReflectorIp(targets,test,cb);
		},
		function (res,cb) {
			// add the IP for each one
			_.forEach(res,function (value,key) {
				targetIds[key].ip = value;
			});
			runTests(tests,targetIds,"container",cb);
		},
		function (res,cb) {
			allResults = res;
			stopReflectors(targetIds,test,cb);
		}
	],function (err) {
		callback(err,allResults);
	});
},

Usage = function () {
	const msg = `

Usage:
${process.argv[1]} [OPTIONS]

OPTIONS:
	--help, -h: show this help
	--type <type>: use only servers of type <type>, normally 1 or 3. May be invoked multiple times. Default is all types.
	--protocol <protocol>: test only protocol <protocol>, normally UDP or TCP. May be invoked multiple times. Default is all of: ${PROTOCOLS.join(" ")}
	--size <size>: test packets of size <size>, an integer. May be invoked multiple times. Default is all of: ${SIZES.join(" ")}
	--test <test>: test to perform. May be invoked multiple times. Default is all of: ${TESTS.join(" ")}
	--network <network>: network test to perform. May be invoked multiple times. Default is all of: ${NETWORKS.join(" ")}
	--project <project>: use existing project ID <project> instead of creating new one
	--keep: do not destroy servers or project at end of test run
	`
	;
	console.log(msg);
	process.exit(1);
}

;


// we need to augment the packet API


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
activeTests = argv.test ? _.uniq(_.reduce([].concat(argv.test),function (result,test) {
	if (_.indexOf(TESTS,test) > -1) {
		result.push(test);
	} else {
		console.log("Unknown test: "+test);
		Usage();
	}
	return result;
},[])) : TESTS,
activeNetworks = _.uniq([].concat(argv.network || NETWORKS)),
totalResults = []
;

if (argv.help || argv.h) {
	Usage();
}

log(`using devices: ${_.keys(activeDevs).join(" ")}`);
log(`using packet sizes: ${activeSizes.join(" ")}`);
log(`using protocols: ${activeProtocols.join(" ")}`);
log(`using tests: ${activeTests.join(" ")}`);
log(`using network tests: ${activeNetworks.join(" ")}`);

// augment packet
augmentPacket(Packet.prototype,PacketAugmenters);



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
						}
						callback(err);
					});
				})(item);
			}
		},cb);
	},	
	// wait for all servers to be ready
	function (cb) {
		log("all servers created");
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
								// save my ID
								devices[name].id = item.id;
								// save my private IP
								devices[name].ip_public = _.find(item.ip_addresses, {public:true,address_family:4,management:true});
								devices[name].ip_private_mgmt = _.find(item.ip_addresses, {public:false,address_family:4,management:true}).address;
								devices[name].ip_private_net = _.map(_.filter(item.ip_addresses,{public:false,address_family:4,management:false}),"address");
								// push those onto the private list
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
	// get all of our available IP ranges
	function (cb) {
		pkt.getIps(projId,false,{include:"assignments"},cb);
	},
	// ensure all IPs are assigned
	function (res,cb) {
		// find the available range 
		// then figure out how many assignments we need, and how many we already have, to determine
		// the total number required
		let privateIpRange = _.find(res.ip_addresses,{address_family:4,public:false}),
		cidr = new CIDR(), fullRange = cidr.list(privateIpRange.network+'/'+privateIpRange.cidr),
		assigned = _.map(privateIpRange.assignments,"network"),
		// we slice 10 because of a bug in how some of the addresses are assigned
		usableIps = _.without.apply(_,[fullRange].concat(assigned)).slice(10),
		// usableIps now contains a full list of usable IPs
		
		// next, we need to make a list of servers and assign IPs
		toAssign = _.reduce(_.keys(activeDevs),function (result,item) {
			// find out how many we need to assign
			let missing = Math.max(2 - devices[item].ip_private_net.length,0);
			for (let i=0; i<missing; i++) {
				result.push({device:item,address:usableIps.shift()+'/32'});
			}
			return result;
		},[]);

		// we now have a list of servers and IPs to assign
		
		async.each(toAssign,function (entry,callback) {
			log(entry.device+": assigning "+entry.address);
			//closure to handle each correctly
			(function(item,address) {
				pkt.assignIp(devices[item].id,{address: address},function (err,data) {
					if(err) {
						log(item+": error assigning "+address);
						log(err);
						log(data);
					} else {
						log(item+": assigned "+address);
						devices[item].ip_private_net.push(address);
					}
					callback(err);
				});
			})(entry.device,entry.address);
		},function (err) {
			cb(err);
		});
	},
	// upload the scripts
	function (cb) {
		log("uploading scripts");
		async.each(_.keys(activeDevs), function (item,cb) {
			// get the IP for the device
			let ipaddr = devices[item].ip_public.address;
			log(item+": uploading scripts to "+ipaddr);
			scp.scp('upload',{
				host: ipaddr,
				username: 'root',
				privateKey: pair.private,
				path: '/root/network-tests/'
			},function (err) {
				if (err) {
					log(item+": failed to upload scripts to "+ipaddr);
				} else {
					log(item+": successfully uploaded scripts to "+ipaddr);
				}
				cb(err);
			});
		}, function (err) {
			if (err) {
				log("failed to upload scripts");
			} else {
				log("scripts uploaded to all servers");
			}
			cb(err);
		});		
	},
	// run installs
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
			let tests = genTestList({protocols:activeProtocols,sizes:activeSizes,networks:activeNetworks,devices:activeDevs, test:"metal", port:NETSERVERPORT, reps: REPETITIONS});
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


		// now run container tests - be sure to exclude metal
		// THESE MUST BE SERIES, OR THEY WILL TROUNCE EACH OTHER!!
		async.eachSeries(_.without(activeTests,'metal'),function (test,cb) {
			log("running container:"+test+" tests");
			// make the list of what we will test
			let tests = genTestList({protocols:activeProtocols,sizes:activeSizes,networks:activeNetworks,devices:activeDevs, test:test, port:NETSERVERPORT, reps: REPETITIONS});
			runContainerTests(tests,test,function (err,data) {
				if(err) {
					log("container:"+test+" errors");
				} else {
					log("container:"+test+" complete");
					totalResults.push.apply(totalResults,data||[]);
				}
				cb(err);
			});
		},function (err) {
			log("container tests complete");
			cb(err);
		});
	},

	// destroy all hosts
	function (cb) {
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
		console.log(totalResults);
	}
});

