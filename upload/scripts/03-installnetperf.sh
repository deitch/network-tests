#!/bin/bash

set -e

yum install -y gcc make
curl -LO ftp://ftp.netperf.org/netperf/netperf-2.7.0.tar.gz
tar -xzvf netperf-2.7.0.tar.gz
cd netperf-2.7.0
./configure
make install
