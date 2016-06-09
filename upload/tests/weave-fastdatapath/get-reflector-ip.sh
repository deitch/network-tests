#!/bin/bash

set -e

localIP=$(docker inspect --format '{{ .NetworkSettings.Networks.weave.IPAddress }}' netserver)

echo $localIP $localIP
