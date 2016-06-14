#!/bin/bash

set -e

localIP=$(docker inspect --format '{{ .NetworkSettings.Networks.calico.IPAddress }}' netserver)

echo $localIP $localIP
