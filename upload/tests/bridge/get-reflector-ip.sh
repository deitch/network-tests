#!/bin/bash

set -e

localIP=$(docker inspect --format '{{ .NetworkSettings.IPAddress }}' netserver)
remoteIP=$PRIVATEMGMTIP

echo $localIP $remoteIP
