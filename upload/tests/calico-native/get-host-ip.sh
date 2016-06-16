#!/bin/bash

set -e

# see which we have
if docker ps -f name=netserver | grep -wq netserver; then
	IP1=$(docker inspect --format '{{ .NetworkSettings.Networks.calico.IPAddress }}' netserver)
fi

npname=netperf-$(hostname)
if docker ps -f name=$npname | grep -wq $npname; then
	IP2=$(docker inspect --format '{{ .NetworkSettings.Networks.calico.IPAddress }}' $npname)
fi

echo $IP1 $IP2

