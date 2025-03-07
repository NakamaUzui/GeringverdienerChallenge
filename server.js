const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;

puppeteer.use(StealthPlugin()); // Anti-Bot aktivieren

const app = express();
const PORT = 3000;

const CLIENT_ID = "1319942796815241256";
const CLIENT_SECRET = "c3uXiuRdz2V4_baRx_NKvq01I8BVyEHS";
const REDIRECT_URI = "http://localhost:3000/auth/discord/callback";

const HENRIK_API_KEY = 'HDEV-2195c2a5-c2fc-4c55-9a07-f8e725dd2b5c';
const HENRIK_BASE_URL = 'https://api.henrikdev.xyz/valorant';

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware für JSON-Parsing
app.use(express.json());

// Speicher für angemeldete Benutzer
const connectedUsers = new Map();

// Pfad zur JSON-Datei
const GROUPS_FILE = path.join(__dirname, 'data', 'groups.json');

// Funktion zum Laden der Gruppen
async function loadGroups() {
    try {
        await fs.mkdir(path.dirname(GROUPS_FILE), { recursive: true });
        const data = await fs.readFile(GROUPS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Wenn Datei nicht existiert oder leer ist, leeres Array zurückgeben
        return [];
    }
}

// Funktion zum Speichern der Gruppen
async function saveGroups(groups) {
    await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2));
}

// Initialisierung der Gruppen beim Serverstart
let groups = [];
(async () => {
    groups = await loadGroups();
    console.log('Gruppen geladen:', groups.length);
})();

// Startseite Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route für Discord OAuth2 Login
app.get('/auth/discord', (req, res) => {
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify connections`;
    res.redirect(authUrl);
});

// Callback-Route für Discord OAuth2
app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    console.log("Authorization Code:", code);

    if (!code) {
        return res.send('Fehler: Kein Code erhalten');
    }

    try {
        // Access Token abrufen
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = tokenResponse.data.access_token;
        console.log("Access Token:", accessToken);

        // Benutzerinformationen abrufen
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Verknüpfungen abrufen
        const connectionsResponse = await axios.get('https://discord.com/api/users/@me/connections', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log("User Data:", userResponse.data);
        console.log("Connections Data:", connectionsResponse.data);

        // Riot Games Account abrufen (falls verknüpft)
        const riotAccount = connectionsResponse.data.find(conn => conn.type === "riotgames");
        let riotStats = {};

        if (riotAccount) {
            riotStats = await getValorantStats(riotAccount.name);
        }

        // Benutzer zur Liste hinzufügen
        connectedUsers.set(userResponse.data.username, {
            username: userResponse.data.username,
            riotStats: riotStats,
            lastSeen: new Date()
        });

        // Weiterleitung zur Startseite mit Benutzerdaten und Valorant Stats
        res.redirect(`/welcome.html?username=${encodeURIComponent(userResponse.data.username)}&riotStats=${encodeURIComponent(JSON.stringify(riotStats))}`);
    } catch (error) {
        console.error("Fehler bei der Authentifizierung:", error.response ? error.response.data : error.message);
        res.send('Fehler bei der Authentifizierung');
    }
});

// Füge eine Logout-Route hinzu
app.get('/logout', (req, res) => {
    res.redirect('/');
});

// Statische Dateien
app.use(express.static(path.join(__dirname, 'public')));

// Neue Route für alle angemeldeten Benutzer
app.get('/api/users', (req, res) => {
    const users = Array.from(connectedUsers.values()).map(user => ({
        username: user.username,
        rank: user.riotStats.rank || 'Unranked',
        lastSeen: user.lastSeen
    }));
    
    res.json({ success: true, users });
});

// Route für Gruppen erstellen
app.post('/api/groups', async (req, res) => {
    try {
        const { name, size, creator } = req.body;
        
        const group = {
            id: Date.now().toString(),
            name,
            size: parseInt(size),
            creator,
            members: [creator],
            createdAt: new Date()
        };
        
        groups.push(group);
        await saveGroups(groups);
        res.json({ success: true, group });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Erstellen der Gruppe' });
    }
});

// Route für alle Gruppen abrufen
app.get('/api/groups', (req, res) => {
    res.json({ success: true, groups });
});

// Route zum Löschen einer Gruppe
app.delete('/api/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        console.log('Attempting to delete group:', groupId); // Debug log
        
        const groupIndex = groups.findIndex(g => g.id === groupId);
        console.log('Found group at index:', groupIndex); // Debug log
        
        if (groupIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Gruppe nicht gefunden' 
            });
        }
        
        groups.splice(groupIndex, 1);
        await saveGroups(groups);
        console.log('Group deleted, remaining groups:', groups); // Debug log
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Interner Server-Fehler' 
        });
    }
});

// Route zum Verlassen einer Gruppe
app.post('/api/groups/:groupId/leave', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { username } = req.body;
        const group = groups.find(g => g.id === groupId);
        
        if (!group) {
            return res.status(404).json({ success: false, message: 'Gruppe nicht gefunden' });
        }
        
        const memberIndex = group.members.indexOf(username);
        if (memberIndex > -1) {
            group.members.splice(memberIndex, 1);
            await saveGroups(groups);
        }
        
        res.json({ success: true, group });
    } catch (error) {
        console.error('Error leaving group:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Verlassen der Gruppe' });
    }
});

// Neue Funktion für API-Abfragen
async function getValorantStats(riotID) {
    try {
        const [name, tag] = riotID.split('#');
        if (!name || !tag) {
            console.log('Invalid RiotID:', riotID);
            return { error: 'Ungültiges RiotID Format' };
        }

        console.log('Fetching stats for:', name, tag); // Debug output

        // MMR Details abrufen
        const mmrResponse = await axios.get(`${HENRIK_BASE_URL}/v2/mmr/eu/${name}/${tag}`, {
            headers: { Authorization: HENRIK_API_KEY }
        });

        console.log('MMR Response:', mmrResponse.data); // Debug output

        // Prüfe ob die MMR-Daten vorhanden sind
        if (!mmrResponse.data.data || !mmrResponse.data.data.current_data) {
            return {
                riotID,
                rank: 'Unranked',
                error: 'Keine Rangdaten gefunden'
            };
        }

        return {
            riotID,
            rank: mmrResponse.data.data.current_data.currenttierpatched || 'Unranked',
            lastMatch: null // Optional: Hier können Sie später Match-Daten hinzufügen
        };
    } catch (error) {
        console.error("API Error:", error.response?.data || error.message);
        return { 
            error: "Fehler beim Abrufen der Valorant-Stats",
            details: error.response?.data?.message || error.message,
            rank: 'Fehler beim Laden'
        };
    }
}

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
