#!/bin/bash

set -e

IP1=$1
IP2=$2

localIP=$(docker inspect --format '{{ .NetworkSettings.IPAddress }}' netserver)
remoteIP=$IP2

echo $localIP $remoteIP