#!/bin/bash

set -e

docker run --net=host -d --name=netserver netperf netserver -D -p $NETSERVERPORT

