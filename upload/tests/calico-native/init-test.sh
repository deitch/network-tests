#!/bin/bash

set -e

npname=netperf-$(hostname)

cid=$(docker run -t -d --net=calico --name=$npname netperf sh)

