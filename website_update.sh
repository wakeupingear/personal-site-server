echo "Stopping forever tasks..."
sudo forever stopall
sudo killall node
cd /home/pi/personal-site-21/public/personal-site-game
echo "Pulling latest game build..."
sudo git pull
echo "Checking Github..."
cd /home/pi/personal-site-21
git fetch origin
reslog=$(git log HEAD..origin/main --oneline)
if [[ "${reslog}" != "hi" ]] ; then
	echo "Changes found in site. Pulling..."
	sudo git stash
	sudo git pull
	echo "Installing npm packages..."
	sudo npm i
	echo "Building site..."
	sudo npm run build
else
	echo "Site up to date"
fi

cd /home/pi/personal-site-server
git fetch origin
sudo git stash
sudo git pull
echo "Installing npm packages..."
sudo npm i

echo "Starting new forever instance..."
sudo forever start /home/pi/personal-site-server/server.js /home/pi/personal-site-21/
echo "Done!"
