#!/bin/bash

set -e

cid=$(docker run -d -t --net=weave --name=netperf netperf sh)

