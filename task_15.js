import fetch from 'node-fetch';
import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';

dotenv.config();

// Funkcja z task_13 do pobierania danych z bazy
async function queryDatabase(query) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/apidb', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: 'database',
                apikey: process.env.PERSONAL_API_KEY,
                query: query
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error querying database:', error);
        throw error;
    }
}

async function main() {
    try {
        // 1. Pobierz wszystkich użytkowników
        const usersResult = await queryDatabase("SELECT * FROM users");
        const users = usersResult.reply;
        
        // 2. Pobierz wszystkie połączenia
        const connectionsResult = await queryDatabase("SELECT * FROM connections");
        const connections = connectionsResult.reply;

        // 3. Neo4j setup
        const driver = neo4j.driver(
            process.env.NEO4J_URI,
            neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
        );

        const session = driver.session();

        try {
            // Wyczyść bazę
            await session.run('MATCH (n) DETACH DELETE n');

            // Stwórz węzły dla wszystkich użytkowników
            const createUsersQuery = `
                UNWIND $users AS user
                CREATE (u:User {
                    id: toString(user.id), 
                    name: user.username
                })
            `;
            await session.run(createUsersQuery, { users });

            // Stwórz połączenia (w obu kierunkach)
            const createConnectionsQuery = `
                UNWIND $connections AS conn
                MATCH (a:User {id: toString(conn.user1_id)})
                MATCH (b:User {id: toString(conn.user2_id)})
                CREATE (a)-[:KNOWS]->(b)
                CREATE (b)-[:KNOWS]->(a)
            `;
            await session.run(createConnectionsQuery, { connections });

            // Znajdź ścieżkę między Rafałem a Barbarą
            const pathQuery = `
                MATCH p=shortestPath(
                    (start:User {name: 'Rafał'})-[:KNOWS*]-(end:User {name: 'Barbara'})
                )
                RETURN [node IN nodes(p) | node.name] as path
            `;
            
            const pathResult = await session.run(pathQuery);

            if (pathResult.records.length > 0) {
                const path = pathResult.records[0].get('path');
                const pathString = path.join(', ');
                console.log('Found path:', pathString);

                // 7. Wyślij wynik
                const tokenResponse = await fetch('https://centrala.ag3nts.org/report', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        apikey: process.env.PERSONAL_API_KEY,
                        task: "connections"
                    })
                });

                const tokenData = await tokenResponse.json();
                
                const answerResponse = await fetch('https://centrala.ag3nts.org/report' + tokenData.token, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        task: 'connections',
                        apikey: process.env.PERSONAL_API_KEY,
                        answer: pathString
                    })
                });

                const result = await answerResponse.json();
                console.log('Answer result:', result);
            } else {
                // Debug: sprawdź połączenia
                const debugQuery = `
                    MATCH (r:User {name: 'Rafał'})-[:KNOWS*1..2]-(other)
                    RETURN other.name
                `;
                const debugResult = await session.run(debugQuery);
                console.log('Users connected to Rafał (up to 2 steps):', 
                    debugResult.records.map(r => r.get('other.name')));
            }

        } finally {
            await session.close();
        }

        await driver.close();

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
