now=$(date +"%T")
echo "Current time : $now"
echo "Stopping forever tasks..."
forever stopall
killall node

cd /home/pi/personal-site-server
git fetch origin
git stash
git pull
echo "Installing npm packages..."
npm i

echo "Starting new forever instance..."
forever start /home/pi/personal-site-server/server.js /home/pi/personal-site-21/
echo "Done!"
