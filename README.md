# Container Network Tests

This repository contains the (mostly) automated testing regimen for comparing the latency and CPU impact of various container networking methodologies. Of course, these methodologies apply to any form of virtualization, including VMs.

This is the basis for the tests used in the LinuxCon/ContainerCon presentation in Tokyo, 13 July 2016 by Avi Deitcher.

## Running the Tests

Impatient to get started. Just run the tests:

1. `git clone https://github.com/deitch/network-tests.git`
2. Set up an account on [Packet.net](https://packet.net), if you do not have one already
3. Get your API key and place it in `./token`
4. `npm install`
5. Run the test: `node ./run.js`

There are many options to control exactly what tests are run and how it behaves. The basic information you need to know is that the test run will:

* Run **all** tests, of **all** kinds, and **all** formats. See below for the list of tests and kinds it will run
* Create a project named `ULL-network-performance-test`, if it does not exist
* Create a new ssh key, storing the keys locally in `./keys` and installing it into the Packet.net account
* Create a server of each type, if they do not exist
* Install all necessary software
* Run all of the tests
* Save the output to `dist/`
* Delete the servers
* Delete the project


### Test Options

This section delineates the various options available for controlling the tests. The options are described in greater detail below.

For any option that accepts a parameter, you can list it multiple times to get multiple parameters. For example, `--type 1 --type 3` means "use type 1 and type 3".

For any option that accepts a parameter, if no parameter is listed, do all. 

* `--help`: list help and options and exit. For each option that accepts a parameter, list all acceptable values.
* `--keep`: keep the project and the servers when test runs are complete.
* `--type <type>`: which Packet.net server types to use. The tests have been designed to run on type 1 and type 3.
* `--protocol <protocol>`: which protocol to test, `UDP` or `TCP` (or both).
* `--size <size>`: Packet payload size to use for round trip tests. Can be any given size. 
* `--network <network>`: which network to test, `local`or `remote`.
* `--test <test>`: which test suite to perform, e.g. `metal`, `bridge`, etc.


##### help

The `--help` option not only lists all available options. It also will list the default and acceptable parameters for all options that accept parameters. This can be useful to see what you can pass to the options.

##### keep

The tests are run using packet.net bare-metal servers. These servers can be expensive to keep setting up and tearing down for two reasons:

1. It takes a decent amount of time to provision a server, sometimes 15-20 minutes.
2. The minimum unit of charge is 1 hour.

If you run 5 tests in a row, you will spend 75-100 minutes just waiting for servers to be recreated. That is a lot of dead time. Additionally, since each server existed only for a few minutes of test, yet was recreated immediately thereafter, you will pay for *an hour* of server time for each 5 minutes.

To eliminate these issues, when running at test, use the `--keep` flag. This will prevent servers from being destroyed at the end of a test run. The next test run will then reuse the existing servers, saving on both startup time and cost.

**Warning:** If you use `--keep`, the servers will not be destroyed, so you will continue to be charged for them. You **must** remember to destroy them yourself later.

##### type

The performance of a test may vary greatly depending on the underlying hardware: CPU class, generation and speed; amount of memory; network card; network connection speed.

Packet.net uses several different types of servers, known as types 0, 1, 2 and 3. We can perform these tests on any types, but by default perform them on types 1 and 3. You can select which ones to run by passing one or more `--type <type>` options.

Run with `--help` to see all supported types.

##### protocol

The latency and performance of networking between two endpoints can be affected greatly by the underlying layer 4 protocol, TCP vs UDP. By default, the tests check both TCP and UDP. However, you can limit the tests to one or the other by passing one or more `--protocol <protocol>` options.

Run with `--help` to see all supported protocols.

##### size

The size of the packet sent between two endpoints can impact the latency and performance of the networking. You can test one or more sizes by passing the one or more `--size <size>` flags. The *size* is in bytes and is passed directly to the underlying netperf in the test-specific `-r size,size` option.

The network tests will accept *any* size you request. To see the default sizes, run with `--help`. 

Note that any size above the network's MTU will give results affected as much by the operating systems's network stack separating the payload into packets as the network itself.
 
##### network

There is a distinct difference in both CPU utilization and performance when checking latency in between two endpoints running on the same physical host vs. two endpoints connecting across a network. These differences can become more acute when the networking technologies are different.

For example:

* A local test on bare metal will use the native network for remote tests and the loopback interface for local tests.
* A bridge test will go across the Linux bridge then the network then the far side Linux bridge for remote tests but use two veth pairs on the same bridge for local tests.
* An SR-IOV test will go across the network almost exactly like bare metal for a remote test while using the network card's built-in software or hardware bridge for local tests.

You can choose whether to test, `local`, `remote` or both types of tests by passing one or more `--network <network>` options. 

Run with `--help` to see all supported options.


##### test

The `test` is the heart of the network tests. It is a series of tests based on the configuration described above. It is what you are testing for network performance.

Each "test" is a collection of scripts to set up, initialize, run, termiante and tear down a test.

Each "test" exists as a named directory in `upload/tests/`. If a directory exists in `upload/tests/`, and it does not begin with a `.` character, it is treated as a test directory. The name of the test directory represents the name of the test, and can be passed to the `--test <test>` option.

Run with `--help` to see all supported tests. The default is to run **all** tests.

The process for writing a new test is described later in this document.

Tests are *always* run the same on both sides. If the default `docker0` bridge is used for the source, then it also is used for the netserver reflector.

As of this writing, the following tests are supported:

* `metal`: Bare metal. Connect netperf running on the host itself to netperf on the same (`local`) or other (`remote`) host. This is the benchmark. When multiple tests are run, if `metal` is one of them, it *always* runs first.
* `bridge`: Default `docker0` bridge with port mapping.
* `bridgenonat`: Similar to the `docker0` bridge, but sets up a Linux bridge directly and does not use NAT. Instead, every workload's IP is a valid one for the underlying network fabric.
* `calico-ipip`: Uses Calico networking, with the `--ipip` (IP-in-IP) tunneling option. 
* `calico-native`: Uses Calico networking, with the native Calico L3 networking.
* `flannel-udp`: Uses flannel networking with UDP encapsulation.
* `flannel-vxlan`: Uses flannel networking with VXLAN encapsulation.
* `host`: Uses straight Docker containers with `--net=host`, i.e. the container has direct access to the network card and stack of the host.
* `macvlan`: Uses a macvlan on top of the primary host network interface, with each macvlan interface placed into the container with `ip link set <interface> netns <pid>`.
* `overlay`: Uses the Docker overlay network.
* `sriov`: Uses the underlying network card's Single-Root IO Virtualization to create new virtual functions (or "virtual network cards"), which are then attached to a given container with `ip link set <interface> netns <pid>`.
* `weave-fastdatapath`: Uses Weave networking with the newer fast datapath (avoid context switch) option.
* `weave-sleeve`: Uses Weave networking with the original sleeve encapsulation.
* `weave-encrypted`: Uses Weave networking with sleeve encapsulation *and* encryption.


### Test Order
When multiple tests are run, the following rules of order are followed:

1. If the tests include `metal`, always run `metal` *first* to provide a baseline.
2. If the tests include `sriov`, always run `sriov` *last*, as the teardown of SRIOV isn't always clean, and may require a reboot.
3. Run all other tests after `metal` and before `sriov` in order passed to `--test` command-line options, or if all tests are running, in alphabetical order.

### How Tests Run

The network performance test program used is [netperf](http://netperf.org). The tests run by launching a netserver as the reflector, and running netperf to test the round-trip response time for UDP and TCP. 

The specific parameters for the test run are provided by various constants in the beginning of `run.js`. However, as of this writing, the general run is:

* netserver: `netserver -D -p 7002`
* netperf: `timeout 60 netperf -P 0 -H $NETSERVERIP -c -t OMNI -l -50000 -v 2 -p 7002 -- -k $TESTUNITS -T $PROTOCOL -d rr -r $SIZE,$SIZE -P 7004,7003`

Where:

- `$NETSERVERIP`: IP address of the netserver. Test runner detemrines if it is different when running a `local` test vs `remote` test.
- `$TESTUNITS`: which test parameters to output. As of this writing, these are: `"LOCAL_CPU_UTIL","RT_LATENCY","MEAN_LATENCY","MIN_LATENCY","MAX_LATENCY","P50_LATENCY","P90_LATENCY","P99_LATENCY"`
- `$PROTOCOL`: which protocol to test, `TCP` or `UDP`
- `$SIZE`: size of the test packets

#### UDP and timeout
TCP communication is connection-oriented. It relies on the operating system network stack to set up a connection and guarantee packet delivery. UDP communication, on the other hand, is connection-less. However, `netperf` relies on each packet arriving and being reflected back by `netserver`. If any packet is lost in transit, the entire test fails.

`netperf` does not make any provisions for the above.

In order to handle this issue, the test regimen runs the entire test run of `netperf` in a `timeout` command, and retries each test up to 3 times. Only if it times out 3 times does the entire test run stop.

As of this writing, the timeout is set to 60 seconds. It is important to balance discovering that a test has failed as quickly as possible with the need to allow some longer-running tests, e.g. encrypted communications, to run to their conclusion.

#### Test Container
With each test run, the Dockerfile in `image/Dockerfile` is build. It is a very simple image, taking the latest [alpine](https://hub.docker.com/_/alpine/) and adding:

* [netperf](http://www.netperf.org) and all related utils to build it
* tcpdump in case needed for debugging
* coreutils to get a consistant `timeout` command

### Host Setup
Upon launching a test suite, the host setup utilities are run. These are the scripts in `scripts/` that set the host up correctly for running the tests. These are intended to be idempotent. If you run them three times in a row, you should get a consistent output.

As of this writing, they do the following:

1. Install `etcd` and start it via systemd
2. Install `docker`, configure it to start via systemd after `etcd`, set the cluster-store option to use etcd, and start it via systemd
3. Install `netperf`
4. Install pciutils, needed for examining the network hardware
5. Install netutils, needed for tcpdump, telnet, debugging and others
6. Set the kernel parameter `pci=assign-busses` to enable proper control of devices

If the kernel parameter was *not* set prior, it will reboot.

## Output Data
The results of the tests are saved in a CSV file in the `dist/` directory. Inside `dist/` you will find a subdirectory named for the moment in time when the test run began, structured as `YYYY-MM-DDTHH_MM_SS_mmmZ/`. In there, in turn, you will find a file named `file.csv` with all necessary data.

The tests do not create graphs. We recommend you open the output files in Excel or Google Sheets to do so.

## Writing New Tests
This is the guide to writing new tests. This should be necessary, for example, if you want to test a new networking methodology.

(in process)
