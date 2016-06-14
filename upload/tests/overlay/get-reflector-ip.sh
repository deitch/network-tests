#!/bin/bash

set -e

localIP=$(docker inspect --format '{{ .NetworkSettings.Networks.overlay.IPAddress }}' netserver)

echo $localIP $localIP
