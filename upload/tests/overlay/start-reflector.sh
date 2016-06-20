#!/bin/bash

set -e

docker run --net=overlay -d --name=netserver netperf netserver -D -p $NETSERVERPORT

