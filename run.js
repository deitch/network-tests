/*jslint node:true, esversion:6 */

var fs = require('fs'), Packet = require('packet-nodejs'), async = require('async'), _ = require('lodash'), 
scp = require('scp2'), CIDR = require('cidr-js'), Addr = require('netaddr').Addr, mkdirp = require('mkdirp'),
ssh = require('simple-ssh'), keypair = require('keypair'), forge = require('node-forge'), jsonfile = require('jsonfile'),
argv = require('minimist')(process.argv.slice(2)), outstream;

// import the token from the file token
const TOKEN = fs.readFileSync('token').toString().replace(/\n/,''), pkt = new Packet(TOKEN),
SSHFILE = './keys',
PROJDATE = new Date().toISOString(),
projName = "ULL-network-performance-test",
SIZES = [300,500,1024,2048],
PROTOCOLS = ['TCP','UDP'],
TESTS = _.filter(fs.readdirSync('./upload/tests'),function(item) { return item.indexOf('.') !== 0;}),
NETWORKS = ["local","remote"],
CHECKDELAY = 30,
NETSERVERPORT = 7002,
NETSERVERDATAPORT = 7003,
NETSERVERLOCALPORT = 7004,
NETPERF_TIMEOUT = 15, // seconds to wait to time out a test
TIMEOUT_CODE = 124, // exit code from GNU coreutils timeout when it times out
TIMEOUT_RETRY = 3, // how many times to try running the netperf command if it times out
REPETITIONS = 50000,
TESTUNITS=[
	"LOCAL_CPU_UTIL","RT_LATENCY","MEAN_LATENCY","MIN_LATENCY","MAX_LATENCY","P50_LATENCY","P90_LATENCY","P99_LATENCY"
],
SIZETOCIDR = {
	1: 32,
	2: 31,
	4: 30,
	8: 29,
	16: 28,
	32: 27,
	64: 26
},
CSVHEADERS = [
	'test', 'type', 'hosttype', 'from', 'to', 'reps', 'size', 'protocol'
],
outdir = './dist/'+PROJDATE.replace(/[:\.]/g,'_')+'/',
outdatafile = outdir+'data.csv',



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
	_.each(params.networks, function (nettest) {
		_.each(params.protocols,function (proto) {
			_.each(params.sizes, function (size) {
				_.each(_.keys(_.pickBy(params.devices,{purpose:"target"})),function (dev) {
					let from = nettest === "local" ? dev : dev.replace('target','source');
					tests.push({test: params.test, type: nettest, hosttype: devices[dev].type,from:from, to:dev, port:params.port, reps: params.reps, size: size, protocol: proto});
				});
			});
		});
	});
	return tests;
},

getPeerName = function (item) {
	let mytype = devices[item].type, purpose = devices[item].purpose === "target" ? "source" : "target",
	peerName = _.keys(_.pickBy(devices,{purpose:purpose, type:mytype}))[0];
	return peerName;
},

freeProjectIps = function (cb) {
	// remove from ip_private_net
	_.each(_.keys(devices),function (item) {
		devices[item].ip_private_net = [];
	});
	// then remove from the actual SDN
	async.waterfall([
		function (cb) {
			log("getting IP ranges");
			pkt.getProjectIpReservations(projId,{include:"assignments"},cb);
		},
		// ensure all IPs are assigned
		function (res,cb) {
			// find the available range 
			// then figure out how many assignments we need, and how many we already have, to determine
			// the total number required
			let privateIpRange = _.find(res.ip_addresses,{address_family:4,public:false}),
			assigned = _.filter(privateIpRange.assignments,{management:false});

			log(`freeing up taken IPs`);
			async.each(assigned,function (ip,callback) {
				log(`freeing up ${ip.address}`);
				pkt.removeIp(ip.id,function (err,data) {
					if(err) {
						log("error releasing "+ip.address);
						log(err);
						log(data);
					} else {
						log("released "+ip.address);
					}
					callback(err);
				});
			},cb);

		}
	],cb);
},

getTestNetworkConfig = function (test,cb) {
	let confFile = `./upload/tests/${test}/network.json`;
	if (fs.existsSync(confFile)) {
		jsonfile.readFile(confFile,cb);
	} else {
		cb(null,null);
	}
},

//mapIps({hosts: allDevs, perhost:false, size: res.network},cb);
mapIps = function (config,cb) {
	log(config);
	if (config && config.hosts && config.size) {
		let size = config.size, perhost = config.perhost, count = perhost ? config.hosts.length : 1;
		async.waterfall([
			// first get all available IPs
			function (cb) {
				log("getting IP ranges");
				pkt.getProjectIpReservations(projId,{},cb);
			},
			// with those IPs, get blocks and assign them
			function (res,cb) {
				let privateIpRange = _.find(res.ip_addresses,{address_family:4,public:false}),
				privateIpCidr = privateIpRange.network+'/'+privateIpRange.cidr,
				addr = Addr(privateIpCidr),
				// how many do we need? and of what size?
				mask = SIZETOCIDR[size],
				cidr = new CIDR(), fullSize = cidr.list(privateIpCidr).length,
				// what is the size we are after, and how many do we assign?
				ipStart = (fullSize-size*count)/size, hostMap = {},
				
				// find out first subnet
				currentCidr = addr.mask(mask);
				// then skip to the right ipStart
				for(let i=0; i<ipStart; i++) {
					currentCidr = currentCidr.nextSibling();
				}
		
				// if it is perhost, then we assign a different range for each host
				// if it is not, then we assign the same range to each host
				hostMap = _.reduce(config.hosts,function (result,host) {
					let myCidr = currentCidr.toString();
					result[host] = {cidr: myCidr, range: cidr.list(myCidr)};
					if (perhost) {
						currentCidr = currentCidr.nextSibling();
					}
					return result;
				},{});
				cb(null,hostMap);
			}
		],cb);
	} else {
		log(`no custom IPs requested`);
		cb(null);
	}
},

assignIps = function (hostIpMap,cb) {
		// we now have a list of servers and IPs to assign
		log(`assigning IPs`);
		// easier if we turn it into an array of assignment first
		let toAssign = _.reduce(_.keys(hostIpMap),function (result,item) {
			let myIps = hostIpMap[item];
			log(`${item}: will assign: ${myIps.join(" ")}`);
			for (let i=0; i<myIps.length; i++) {
				result.push({device:item,address:myIps[i]});
			}
			return result;
		},[]);
		
		async.each(toAssign,function (entry,callback) {
			log(`${entry.device}: assigning ${entry.address}`);
			//closure to handle each correctly
			(function(item,address) {
				devices[item].ip_private_net.push(address);
				pkt.assignIp(devices[item].id,{address: address},function (err,data) {
					if(err) {
						log(item+": error assigning "+address);
						log(err);
						log(data);
					} else {
						log(item+": assigned "+address);
					}
					callback(err);
				});
			})(entry.device,entry.address);
		},function (err) {
			if (err) {
				log(`error assigning IPs`);
			} else {
				log(`done assigning all IPs`);
			}
			cb(err);
		});
},

makeShellEnv = function (hashEnv) {
	return _.reduce(hashEnv,function (result,value,key) {
		result.push(`${key}="${value}"`);
		return result;
	},[]).join(" ");
},

runCmd = function (host,cmds,callback) {
	let errCode = false, output = null,
	session = new ssh({
		host: devices[host].ip_public,
		user: "root",
		key: pair.private
	}),
	env = makeShellEnv(devices[host].env);
	// add each cmd up
	_.each(cmds,function (cmdset) {
		let cmd = cmdset.cmd, msg = cmdset.msg;
		log(`${host}: ${cmd}`);
		session.exec(`${env} ${cmd}`,{
			exit: function (code,stdout,stderr) {
				if (code !== 0) {
					log(`code: ${code}`);
					log(stderr);
					log(stdout);
					errCode = true;
					session.end();
					callback({msg:host+": Failed to "+msg,code: code});
				} else {
					output = stdout;
				}
			}
		});
	});
	session.on('error',function (err) {
		log(host+": ssh error connecting");
		log(err);
		errCode = true;
		session.end();
		callback(host+": ssh connection failed");
	});
	session.on('close',function (hadError) {
		if (!hadError && !errCode) {
			callback(null,output);
		}
	});
	session.start();
},

installSoftware = function (targets,test,callback) {
	// now start the reflector on each
	async.each(targets,function (target,cb) {
		let cmd = `network-tests/tests/${test}/install-software.sh`;
		runCmd(target,[{cmd:cmd,msg:"install test software"}],cb);
	},function (err) {
		if(err) {
			callback(err);
		} else {
			callback(null);
		}
	});
},

getHostEnv = function (targets,callback) {
	// now start the reflector on each
	async.map(targets,function (target,cb) {
		let cmd = `network-tests/common/get-host-env.sh`;
		runCmd(target,[{cmd:cmd,msg:"get host environment"}],cb);
	},function (err,data) {
		let envMap;
		if(!err) {
			// fill in results
			// data is an array of results, one for each target
			envMap = _.reduce(targets,function (result,item,index) {
				// convert KEY=value into js object
				result[item] = _.reduce(data[index].split(/\n/,function (res,item) {
					let parts = item.split('=',2);
					if (parts.length === 2) {
						res[parts[0]] = parts[1];
					}
					return res;
				},{}));
				return result;
			},{});
		}
		callback(err,envMap);
	});
},

setupNetwork = function (targets,test,callback) {
	// now start the reflector on each
	async.each(targets,function (target,cb) {
		// how do I find my peer? I find my type from devices, then all of the same type, then exclude myself
		let cmd = `network-tests/tests/${test}/setup-network.sh`;
		runCmd(target,[{cmd:cmd,msg:"setup network"}],cb);
	},function (err) {
		if(err) {
			callback(err);
		} else {
			callback(null);
		}
	});
},

teardownNetwork = function (targets,test,callback) {
	// now start the reflector on each
	async.each(targets,function (target,cb) {
		let cmd = `network-tests/tests/${test}/teardown-network.sh`;
		runCmd(target,[{cmd:cmd,msg:"tear down network"}],cb);
	},function (err) {
		if(err) {
			callback(err);
		} else {
			callback(null);
		}
	});
},

startReflectors = function (targets,test,callback) {
	let targetIds = {};
	// now start the reflector on each
	async.each(targets,function (target,cb) {
		let cmd = `network-tests/tests/${test}/start-reflector.sh`;
		targetIds[target] = {};

		// start the netserver
		runCmd(target,[{cmd:cmd,msg:"start netserver"}],cb);
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
		let cmd = `network-tests/tests/${test}/get-reflector-ip.sh`;

		log(`${target}: getting reflector IP`);
		log(`${target}: ${cmd}`);
		runCmd(target,[{cmd:cmd,msg:"get netserver IP"}],function (err,data) {
			if (!err) {
				let ip = data.replace(/\s+/g," ").replace(/(^\s+|\s+$)/,'').split(/\s/);
				ips[target] = {local:ip[0],remote:ip[1]};
				log(`${target}: retrieved netserver IP local:${ips[target].local} remote:${ips[target].remote}`);
			}
			cb(err);
		});
	},function (err) {
		if(err) {
			callback(err);
		} else {
			callback(null,ips);
		}
	});
},

getHostIps = function (devs,test,callback) {
	let ips = {};
	if (fs.existsSync(`upload/tests/${test}/get-host-ip.sh`)) {
		// now start the reflector on each
		async.each(devs,function (target,cb) {
			let cmd = `network-tests/tests/${test}/get-host-ip.sh`;
			log(`${target}: getting host allocated IP`);
			log(`${target}: ${cmd}`);

			runCmd(target,[{cmd:cmd,msg:"get host used IPs"}],function (err,data) {
				if (!err) {
					// the stdout response should be a space separated list of IPs. The first is for local, the second is for remote
					ips[target] = data.replace(/\s+/g," ").replace(/(^\s+|\s+$)/,'').split(/\s/);
					log(`${target}: retrieved allocated IPs ${ips[target].join(",")}`);
				}
				cb(err);
			});
		},function (err) {
			if(err) {
				callback(err);
			} else {
				callback(null,ips);
			}
		});
	} else {
		callback(null,ips);
	}
},


initializeTests = function (tests,test,callback) {
	// this must be run in series so they don't impact each other
	if (fs.existsSync(`upload/tests/${test}/init-test.sh`)) {
		// every test.from should have init test run exactly once
		async.mapSeries(_.uniq(_.map(tests,'from')),function (host,cb) {
			let msg = `${host}: init test ${test}`,
			cmd = `network-tests/tests/${test}/init-test.sh`;

			log(msg);
			runCmd(host,[{cmd:cmd,msg:"init-test"}],cb);

		},function (err) {
			callback(err);
		});
	} else {
		callback(null);
	}
},

termTests = function (tests,test,callback) {
	// this must be run in series so they don't impact each other
	if (fs.existsSync(`upload/tests/${test}/term-test.sh`)) {
		// every test.from should have term test run exactly once
		async.mapSeries(_.uniq(_.map(tests,'from')),function (host,cb) {
			let msg = `${host}: term test ${test}`,
			cmd = `network-tests/tests/${test}/term-test.sh`;

			log(msg);
			runCmd(host,[{cmd:cmd,msg:"term-test"}],cb);

		},function (err) {
			callback(err);
		});
	} else {
		callback(null);
	}
},



runTests = function (tests,targets,msgPrefix,callback) {
	// this must be run in series so they don't impact each other
	async.mapSeries(tests,function (t,cb) {
		let msg = msgPrefix+" test: "+t.type+" "+t.protocol+" "+t.size,
		target = targets[t.to].ip[t.type];
		log(t.from+": running "+msg);
		// get the private IP for the device
		let cmd = `network-tests/tests/${t.test}/run-test.sh timeout ${NETPERF_TIMEOUT} netperf -P 0 -H ${target} -c -t OMNI -l -${t.reps} -v 2 -p ${t.port} -- -k ${TESTUNITS.join(",")} -T ${t.protocol} -d rr -r ${t.size},${t.size} -P ${NETSERVERLOCALPORT},${NETSERVERDATAPORT}`;
		// try this in case of timeout up to 3 times
		async.retry(TIMEOUT_RETRY,function (cb) {
			runCmd(t.from,[{cmd:cmd,msg:"run-test"}],function (err,data) {
				if (err && err.code && err.code === TIMEOUT_CODE) {
					log(`${t.from} netperf timed out`);
				}
				cb(err,_.extend({},t,{results:data}));
			});
		},cb);
	},callback);
},




stopReflectors = function (targets,test,callback) {
	// stop the netserver reflectors
	async.each(_.keys(targets),function (target,cb) {
		let cmd = `network-tests/tests/${test}/stop-reflector.sh`;
		runCmd(target,[{cmd:cmd,msg:"stop netserver"}],cb);
	},callback);
},

runTestSuite = function (tests,test,callback) {
	// need to start the reflector container on each target
	
	// find all of the targets
	let targets = _.uniq(_.map(tests,"to")), allDevs = _.keys(activeDevs), targetIds = {}, allResults;
	
	// clear target env
	_.each(allDevs,function (host) {
		devices[host].env = {};
	});
	
	// 1- create networks, if needed
	// 2- start reflectors
	// 3- run tests
	// 4- stop reflectors
	// 5- remove networks
	
	async.waterfall([
		freeProjectIps,
		function (cb) {
			installSoftware(allDevs,test,cb);
		},
		// get the network.conf
		function (cb) {
			getTestNetworkConfig(test,cb);
		},
		// map the IPs to the hosts
		function (res,cb) {
			if (!res) {
				cb(null,null);
			} else if (res.network !== undefined) {
				mapIps({hosts: allDevs, perhost:false, size: res.network},cb);
			} else if (res.host !== undefined) {
				mapIps({hosts: allDevs, perhost: true, size: res.host},cb);
			} else {
				cb(null,null);
			}
		},
		function (res,cb) {
			// res now has a hash of IP cidr we can use for each host or for the network
			_.forOwn(res,function (ips,host) {
				devices[host].ip_private_net_cidr = ips.cidr;
				devices[host].ip_private_net = ips.range;
			});
			getHostEnv(allDevs,cb);
		},
		function (res,cb) {
			_.forOwn(res,function (hostEnv,host) {
				let privateIps = devices[host].ip_private_net, privateIpCidr = devices[host].ip_private_net_cidr,
				peerName = getPeerName(host),
				peer = devices[peerName].ip_private_mgmt,
				ipsArg = privateIps.length === 0 ? {} : {PRIVATEIPS: privateIps.join(","), PRIVATEIPCIDR: privateIpCidr},
				env = _.extend({
					PEER: peer,
					PEERNAME: peerName,
					NETSERVERPORT: NETSERVERPORT,
					LOCALPORT: NETSERVERLOCALPORT,
					NETSERVERDATAPORT: NETSERVERDATAPORT,
					DEVTYPE: devices[host].purpose,
					HOSTNAME: host,
					PRIVATEMGMTIP: devices[host].ip_private_mgmt,
					PRIVATEMGMTIPCIDR: devices[host].ip_private_mgmt+'/31',
					PUBLICIP: devices[host].ip_public,
					PUBLICIPCIDR: devices[host].ip_public+'/31'
				},ipsArg,hostEnv);
				devices[host].env = env;
			});
			setupNetwork(allDevs,test,cb);
		},
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
			initializeTests(tests,test,cb);
		},
		function (cb) {
			getHostIps(allDevs,test,cb);
		},
		function (res,cb) {
			assignIps(res,cb);
		},
		function (cb) {
			runTests(tests,targetIds,test,cb);
		},
		function (res,cb) {
			allResults = res;
			termTests(tests,test,cb);
		},
		function (cb) {
			stopReflectors(targetIds,test,cb);
		},
		function (cb) {
			teardownNetwork(allDevs,test,cb);
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
	--keep: do not destroy servers or project at end of test run, in which case you will have to destroy them manually
	
	Will try to reuse existing project named ${projName} if it exists, else it will create it. 
	`
	;
	console.log(msg);
	process.exit(1);
}

;



// use command line args to determine
// - if to install software
// - if to run tests
// - if to destroy project
// default:
//		software: install
//		tests: run
var projId,
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
totalResults = [],
saveTestResults = function (results,cb) {
	// do we have an output file?
	results = results || [];
	totalResults.push.apply(totalResults,results);
	// write the result line to outdatafile
	// each line is the data, plus the results
	if (results.length > 0) {
		_.each(results,function (t) {
			// first get the fixed information
			let data = t.results || '', fixedLine = _.map(CSVHEADERS,function (field) {
				return t[field];
			}),
			dataAsMap = _.reduce(data.split(/\n/),function (keyMap,item) {
				let parts = item.split('=',2);
				keyMap[parts[0]] = parts[1];
				return keyMap;
			},{}),
			dataLine = _.map(TESTUNITS,function (field) {
				return dataAsMap[field];
			});
			outstream.write(_.concat(fixedLine,dataLine).join(',')+'\n');
		});
	}
	cb(null);
}
;

if (argv.help || argv.h) {
	Usage();
}

log(`using devices: ${_.keys(activeDevs).join(" ")}`);
log(`using packet sizes: ${activeSizes.join(" ")}`);
log(`using protocols: ${activeProtocols.join(" ")}`);
log(`using tests: ${activeTests.join(" ")}`);
log(`using network tests: ${activeNetworks.join(" ")}`);


// get the public key in the right format
if (fs.existsSync(SSHFILE)) {
	pair = jsonfile.readFileSync(SSHFILE);
} else {
	pair = keypair();
	pair.sshPublicKey = forge.ssh.publicKeyToOpenSSH(forge.pki.publicKeyFromPem(pair.public),"ULL-test-user@atomicinc.com");
	jsonfile.writeFileSync(SSHFILE,pair);
}

// create the output directory
log(`creating output directory ${outdir}`);
mkdirp.sync(outdir);
log(`opening output file ${outdatafile}`);
outstream = fs.createWriteStream(outdatafile);
outstream.on('error',function (err) {
	log(`error writing to ${outdatafile}`);
	log(err);
}).on('finish',function () {
	log(`finished writing to ${outdatafile}`);
}).on('close',function () {
	log(`closed stream for ${outdatafile}`);
});
// our header for the csv file
outstream.write(_.union(CSVHEADERS,TESTUNITS).join(",")+'\n');


async.waterfall([
	// get list of projects and see if the one we want already exists
	function (cb) {
		pkt.getProjects(null,{},cb);
	},
	function (res,cb) {
		// is there a project with our targeted name? if so, use it
		const targetProj = _.find(res.projects,{name:projName});
		if (!targetProj) {
			log("creating new project");
			pkt.addProject({name:projName},cb);
		} else {
			projId = targetProj.id;
			log(`reusing existing project ${projName} ${projId}`);
			cb(null,{id:projId});
		}
	},
	// check if this keypair exists or add it
	function (res,cb) {
		projId = res.id;
		log(`project ready: ${projId}`);
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
								devices[name].ip_public = _.find(item.ip_addresses, {public:true,address_family:4,management:true}).address;
								devices[name].ip_private_mgmt = _.find(item.ip_addresses, {public:false,address_family:4,management:true}).address;
								devices[name].ip_private_net = [];
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
	// upload the scripts
	function (cb) {
		log("uploading scripts");
		async.each(_.keys(activeDevs), function (item,cb) {
			// get the IP for the device
			let ipaddr = devices[item].ip_public;
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
			let ipaddr = devices[item].ip_public,
			mgmt = devices[item].ip_private_mgmt,
			peerName = getPeerName(item),
			peer = devices[peerName].ip_private_mgmt;
			log(`${item}: installing software on ${ipaddr}`);
			runCmd(item,[
				{cmd: `network-tests/scripts/01-installetcd.sh ${mgmt} ${peer} ${peerName}`, msg:"install etcd"},
				{cmd: `network-tests/scripts/02-installdocker.sh`, msg:"install docker"},
				{cmd: `network-tests/scripts/03-installnetperf.sh`, msg:"install netperf"},
				{cmd: `network-tests/scripts/04-installpciutils.sh`, msg:"install pciutils"},
				{cmd: `docker build -t netperf network-tests/image`, msg:"build netperf image"}
			],cb);
		}, function (err) {
			if (err) {
				log("failed to install software");
			} else {
				log("software installed in all servers");
			}
			cb(err);
		});		
	},
	
	// set any necessary kernel parameters and other changes that require reboot
	function (cb) {
		log("setting kernel parameters");
		let reboot = false, rebootWait = 60;
		async.each(_.keys(activeDevs), function (item,cb) {
			// get the private IP for the device
			log(`${item}: setting kernel parameters`);
			runCmd(item,[{cmd:`network-tests/scripts/99-assignbusses.sh`,msg:"set kernel parameters"}],function (err,data) {
				if (data && data.indexOf("REBOOT") > -1) {
					reboot = true;
				}
				cb(err);
			});
		}, function (err) {
			if (err) {
				log("failed to set kernel parameters");
				cb(err);
			} else {
				log("kernel parameters set for all servers");
				if (reboot) {
					log(`reboot was required, waiting ${rebootWait} seconds`);
					setTimeout(function () {
						cb();
					},rebootWait*1000);
				} else {
					cb();
				}
			}
		});	
	},

	
	// run all of our tests
	
	// first run our benchmark bare metal tests
	function (cb) {
		if (_.indexOf(activeTests,"metal") > -1) {
			log("running metal tests");
			// make the list of what we will test
			let tests = genTestList({protocols:activeProtocols,sizes:activeSizes,networks:activeNetworks,devices:activeDevs, test:"metal", port:NETSERVERPORT, reps: REPETITIONS});
			runTestSuite(tests,'metal',cb);
		} else {
			log("skipping metal tests");
			cb(null,null);
		}
	},
	// and capture the output
	function (results,cb) {
		// save the results
		log("metal tests complete");
		saveTestResults(results,cb);
	},
	function (cb) {
		// now run container tests - be sure to exclude metal
		// THESE MUST BE SERIES, OR THEY WILL TROUNCE EACH OTHER!!
		async.eachSeries(_.without(activeTests,'metal','sriov'),function (test,cb) {
			log("running container:"+test+" tests");
			// make the list of what we will test
			let tests = genTestList({protocols:activeProtocols,sizes:activeSizes,networks:activeNetworks,devices:activeDevs, test:test, port:NETSERVERPORT, reps: REPETITIONS});
			runTestSuite(tests,test,function (err,data) {
				if(err) {
					log("container:"+test+" errors");
					cb(err);
				} else {
					log("container:"+test+" complete");
					saveTestResults(data,cb);
				}
			});
		},function (err) {
			log("container tests complete");
			cb(err);
		});
	},
	// last run our SR-IOV tests
	function (cb) {
		if (_.indexOf(activeTests,"sriov") > -1) {
			log("running sriov tests");
			// make the list of what we will test
			let tests = genTestList({protocols:activeProtocols,sizes:activeSizes,networks:activeNetworks,devices:activeDevs, test:"sriov", port:NETSERVERPORT, reps: REPETITIONS});
			runTestSuite(tests,'sriov',cb);
		} else {
			log("skipping sriov tests");
			cb(null,null);
		}
	},
	// destroy all hosts
	function (results,cb) {
		// save the results
		log("sriov tests complete");
		saveTestResults(results,cb);
	},
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
	outstream.end();
	log("test run complete");
	log(`results in ${outdatafile}`);
	if (err) {
		log(err);
	}
});

