import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Get current file path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildDetailedReport(directory) {
    try {
        console.log('\n=== Building Detailed Report ===');
        let reportContent = '# Detailed Analysis Report\n\n';

        // Process facts first
        console.log('\n📁 Processing facts directory...');
        reportContent += '## Facts Analysis\n\n';
        const factsDir = path.join(directory, 'facts');
        const factFiles = await fs.readdir(factsDir);
        const factTxtFiles = factFiles.filter(file => file.endsWith('.txt'));
        
        console.log(`Found ${factTxtFiles.length} fact files to process`);
        
        for (const file of factTxtFiles) {
            console.log(`\n📄 Processing fact file: ${file}`);
            const content = await fs.readFile(path.join(factsDir, file), 'utf-8');
            console.log('Content length:', content.length, 'characters');
            
            console.log('Analyzing content...');
            const analysis = await analyzeContent(content, 'fact');
            console.log('Analysis completed. Length:', analysis.length, 'characters');
            
            reportContent += `### ${file}\n${analysis}\n\n`;
            console.log(`✅ Fact file ${file} processed`);
        }

        // Process main files
        console.log('\n📁 Processing main directory files...');
        reportContent += '## Main Files Analysis\n\n';
        const files = await fs.readdir(directory);
        const txtFiles = files
            .filter(file => file.endsWith('.txt'))
            .filter(file => !file.includes('facts/'));

        console.log(`Found ${txtFiles.length} main files to process`);

        for (const file of txtFiles) {
            console.log(`\n📄 Processing main file: ${file}`);
            const content = await fs.readFile(path.join(directory, file), 'utf-8');
            console.log('Content length:', content.length, 'characters');
            
            console.log('Analyzing content...');
            const analysis = await analyzeContent(content, 'main');
            console.log('Analysis completed. Length:', analysis.length, 'characters');
            
            reportContent += `### ${file}\n${analysis}\n\n`;
            console.log(`✅ Main file ${file} processed`);
        }

        // Save report with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFilename = `report_${timestamp}.md`;
        await fs.writeFile(reportFilename, reportContent);
        console.log(`\n📝 Detailed report saved to ${reportFilename}`);
        
        // Also save latest version
        await fs.writeFile('report_latest.md', reportContent);
        console.log('📝 Latest report saved to report_latest.md');
        
        return reportContent;
    } catch (error) {
        console.error('❌ Error building report:', error);
        throw error;
    }
}

async function analyzeContent(content, type) {
    try {
        console.log(`\n🔍 Analyzing ${type} content...`);
        console.log('Content excerpt:', content.substring(0, 100) + '...');
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are analyzing ${type} files from a factory security system.
Create a detailed analysis including:
1. MAIN TOPICS:
   - Key themes and subjects
   - Primary security concerns

2. ENTITIES:
   - People involved
   - Locations mentioned
   - Equipment and systems

3. EVENTS:
   - Specific incidents
   - Timeline of events
   - Security breaches

4. TECHNICAL DETAILS:
   - Systems involved
   - Technical specifications
   - Security measures

5. CONNECTIONS:
   - Links to other events
   - Related personnel
   - System interconnections

Provide analysis in Polish. Be specific and detailed.`
                },
                {
                    role: "user",
                    content: `Analyze this content:\n\n${content}`
                }
            ],
            temperature: 0.3,
            max_tokens: 1000
        });

        const analysis = response.choices[0].message.content.trim();
        console.log('✅ Analysis completed');
        console.log('Analysis length:', analysis.length, 'characters');
        console.log('Analysis excerpt:', analysis.substring(0, 100) + '...');
        
        return analysis;
    } catch (error) {
        console.error('❌ Error in content analysis:', error);
        throw error;
    }
}

async function generateMetadata(reportContent, directory) {
    try {
        console.log('\nGenerating metadata from report...');
        const metadata = {};
        
        const files = await fs.readdir(directory);
        const txtFiles = files
            .filter(file => file.endsWith('.txt'))
            .filter(file => !file.includes('facts/'));

        for (const file of txtFiles) {
            console.log(`Generating keywords for ${file}`);
            const keywords = await generateKeywords(file, reportContent);
            metadata[file] = keywords;
        }

        return metadata;
    } catch (error) {
        console.error('Error generating metadata:', error);
        throw error;
    }
}

async function generateKeywords(filename, reportContent) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Based on the detailed report, generate exactly 10 relevant keywords in Polish for the specified file.
Keywords should:
- Be in nominative case
- Be specific and searchable
- Relate to security events, people, places, or technical aspects
- Consider connections with other files
- Be based on the entire context from the report`
                },
                {
                    role: "user",
                    content: `Report content: ${reportContent}\n\nGenerate 10 keywords for file: ${filename}`
                }
            ],
            temperature: 0.3,
            max_tokens: 150
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error(`Error generating keywords for ${filename}:`, error);
        throw error;
    }
}

async function buildContextualMetadata(directory) {
    try {
        console.log('\n=== Building Contextual Metadata ===');

        // Step 1: Process facts first
        console.log('\n1️⃣ Processing facts to build people and context database...');
        const factsContext = await processFacts(directory);
        console.log(`Found information about ${Object.keys(factsContext.peopleToFacts).length} people in facts`);
        
        // Step 2: Process main reports
        console.log('\n2️⃣ Processing main reports...');
        const metadata = await processReports(directory, factsContext);
        
        return metadata;
    } catch (error) {
        console.error('❌ Error building contextual metadata:', error);
        throw error;
    }
}

async function processFacts(directory) {
    try {
        console.log('\n1️⃣ Processing facts to build people and context database...');
        const factsDir = path.join(directory, 'facts');
        const factFiles = (await fs.readdir(factsDir)).filter(f => f.endsWith('.txt'));
        
        // Initialize our databases
        const peopleToFacts = {};  // Person -> [fact details]
        const factDetails = {};    // FactID -> {content, people, keywords}
        
        for (const file of factFiles) {
            console.log(`\n📄 Processing fact file: ${file}`);
            const content = await fs.readFile(path.join(factsDir, file), 'utf-8');
            
            try {
                // Step 1: Extract all people mentioned in this fact
                console.log('Extracting people from fact...');
                const peopleResponse = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: `Analyze this fact and list ALL people mentioned. Consider:
- Full names and partial names
- Roles and titles
- Any animals mentioned
- Any references to living beings
Return as JSON in this exact format:
{
    "people": [
        {
            "name": "person's name",
            "role": "their role/title",
            "isMainPerson": true/false
        }
    ]
}`
                        },
                        {
                            role: "user",
                            content: content
                        }
                    ],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                });

                // Validate response
                if (!peopleResponse?.choices?.[0]?.message?.content) {
                    throw new Error('Invalid API response structure');
                }

                let parsedResponse;
                try {
                    parsedResponse = JSON.parse(peopleResponse.choices[0].message.content);
                } catch (parseError) {
                    console.error('Error parsing JSON response:', parseError);
                    parsedResponse = { people: [] };
                }

                const peopleInFact = parsedResponse.people || [];
                console.log(`Found ${peopleInFact.length} people/beings in fact:`, 
                    peopleInFact.map(p => p.name).join(', ') || 'none');
                
                // Step 2: Generate keywords for this fact
                console.log('Generating fact keywords...');
                const keywordsResponse = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: `Generate keywords for this fact. Include:
- People mentioned
- Locations/sectors
- Any animals or living beings
- Key events or findings
Return as comma-separated list in Polish.`
                        },
                        {
                            role: "user",
                            content: content
                        }
                    ],
                    temperature: 0.1
                });
                
                const keywords = keywordsResponse?.choices?.[0]?.message?.content?.trim() || '';
                
                // Store fact details
                factDetails[file] = {
                    content,
                    people: peopleInFact,
                    keywords
                };
                
                // Map people to this fact
                peopleInFact.forEach(person => {
                    if (!peopleToFacts[person.name]) {
                        peopleToFacts[person.name] = [];
                    }
                    peopleToFacts[person.name].push({
                        file,
                        content,
                        keywords,
                        isMainPerson: person.isMainPerson
                    });
                });

            } catch (factError) {
                console.warn(`⚠️ Warning: Error processing fact ${file}:`, factError.message);
                // Continue with next fact instead of breaking the whole process
                continue;
            }
        }
        
        console.log('\nFacts processing completed:');
        console.log(`- Found ${Object.keys(peopleToFacts).length} unique people/beings`);
        console.log(`- Processed ${Object.keys(factDetails).length} facts`);
        
        return { peopleToFacts, factDetails };
    } catch (error) {
        console.error('Error processing facts:', error);
        // Return empty results instead of throwing
        return { peopleToFacts: {}, factDetails: {} };
    }
}

async function processReports(directory, factsContext) {
    try {
        const files = (await fs.readdir(directory))
            .filter(f => f.endsWith('.txt'))
            .filter(f => !f.includes('facts/'));
        
        const metadata = {};
        
        for (const file of files) {
            console.log(`\n📄 Processing report: ${file}`);
            const content = await fs.readFile(path.join(directory, file), 'utf-8');
            
            // Step 1: Determine the person this report is about
            console.log('Identifying main person...');
            const mainPerson = await identifyMainPerson(content);
            console.log(`Main person identified: ${mainPerson}`);
            
            // Step 2: Get relevant facts for this person
            const relevantFacts = factsContext.peopleToFacts[mainPerson] || [];
            console.log(`Found ${relevantFacts.length} relevant facts`);
            
            // Step 3: Generate keywords using combined context
            console.log('Generating contextual keywords...');
            const keywords = await generateContextualKeywords(
                content,
                file,
                relevantFacts
            );
            
            metadata[file] = keywords;
            console.log(`✅ Processed ${file}`);
        }
        
        return metadata;
    } catch (error) {
        console.error('❌ Error processing reports:', error);
        throw error;
    }
}

async function extractPeople(content) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a detailed analyzer looking for people mentioned in security reports.
                    
Follow these steps carefully:
1. First, read the entire text thoroughly
2. Then, ask yourself:
   - Who are the main actors in this text?
   - Are there any programmers or technical staff?
   - Are there any teachers or educators mentioned?
   - Are there any security personnel?
   - Have I missed any names mentioned even briefly?
3. For each person found, verify:
   - Their role/occupation
   - Their connection to the events
   - Whether they're mentioned multiple times
4. Double-check for:
   - Partial names
   - Nicknames
   - Professional titles with names
   - Indirect references to people

Return ONLY a comma-separated list of ALL verified names.`
                },
                {
                    role: "user",
                    content: `Analyze this text carefully and list ALL people mentioned:\n\n${content}\n\nBefore responding, verify you haven't missed anyone.`
                }
            ],
            temperature: 0.1
        });
        
        return response.choices[0].message.content
            .split(',')
            .map(name => name.trim())
            .filter(name => name.length > 0);
    } catch (error) {
        console.error('❌ Error extracting people:', error);
        throw error;
    }
}

async function identifyMainPerson(content) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are analyzing a security report to identify its main subject.
                    
Follow these steps:
1. Read the entire text carefully
2. Ask yourself:
   - Who is this report primarily about?
   - Is there a teacher or educator involved?
   - Is there a programmer or technical person involved?
   - Who is mentioned most frequently?
   - Who is central to the events described?
3. Verify your choice by:
   - Counting mentions of each person
   - Analyzing their role in the events
   - Checking if they're the subject of actions/observations
4. Double-check by asking:
   - Am I certain this is the main person?
   - Have I considered all mentions?
   - Is this person truly central to the report?

Return ONLY the name of the main person. If truly uncertain, return "NO_PERSON_FOUND".`
                },
                {
                    role: "user",
                    content: `Analyze this text and identify the main person:\n\n${content}\n\nBefore responding, verify your conclusion.`
                }
            ],
            temperature: 0.1
        });
        
        const person = response.choices[0].message.content.trim();
        return person === "NO_PERSON_FOUND" ? null : person;
    } catch (error) {
        console.error('❌ Error identifying main person:', error);
        throw error;
    }
}

async function generateContextualKeywords(content, filename, factsContext) {
    try {
        console.log(`\n🔍 Analyzing ${filename} for context...`);
        
        // Step 1: Initial Analysis
        let analysis;
        try {
            const analysisResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `You are expert analyzing report and creating certain keywords to the report:


Provide a clear analysis of what's actually present in the report and put all keywords important and related to the report.`
                    },
                    {
                        role: "user",
                        content: `Report Content: ${content}
Filename: ${filename}

What significant elements are actually present in this report?`
                    }
                ],
                temperature: 0.1
            });

            analysis = analysisResponse?.choices?.[0]?.message?.content || 'Analysis failed';
        } catch (analysisError) {
            console.error('Error in analysis:', analysisError);
            analysis = 'Analysis failed';
        }

        // Step 2: Generate Keywords
        try {
            const keywordsResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Based on the analysis, generate keywords in Polish that capture the significant elements found.

FOCUS ON:
- Actual findings in the report
- Real people or beings mentioned
- Actual events that occurred
- Real technical elements present
- Genuine connections found
- put only keywords that are important and related to the report

DO NOT:
- Make assumptions
- Add speculative information
- Include routine or standard elements
- Generate generic keywords

Return only keywords that represent actual findings from the report.`
                    },
                    {
                        role: "user",
                        content: `Analysis: ${analysis}
Original Content: ${content}

Generate keywords that accurately represent what was found in this report.`
                    }
                ],
                temperature: 0.1
            });

            return keywordsResponse?.choices?.[0]?.message?.content?.trim() || 'brak_słów_kluczowych';
        } catch (error) {
            console.error('Error generating keywords:', error);
            return 'brak_słów_kluczowych';
        }
    } catch (error) {
        console.error(`Error in keyword generation for ${filename}:`, error);
        return 'brak_słów_kluczowych';
    }
}

async function main() {
    try {
        // Download and extract files
        console.log('1. Downloading and extracting files...');
        const response = await fetch('https://centrala.ag3nts.org/dane/pliki_z_fabryki.zip');
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        await fs.writeFile('pliki_z_fabryki.zip', buffer);
        const zip = new AdmZip('pliki_z_fabryki.zip');
        zip.extractAllTo('extracted_files', true);
        
        // Build contextual metadata
        const metadata = await buildContextualMetadata('extracted_files');
        
        // Save metadata
        await fs.writeFile('metadata.json', JSON.stringify(metadata, null, 2));
        console.log('\nMetadata saved to metadata.json');
        
        // Send report
        console.log('\nSending report...');
        const reportResult = await sendReport(metadata);
        console.log('Report sent:', reportResult);
        
        // Cleanup
        await fs.unlink('pliki_z_fabryki.zip');
        await fs.rm('extracted_files', { recursive: true });
        console.log('Cleanup completed');
        
    } catch (error) {
        console.error('Error in main:', error);
    }
}

async function sendReport(metadata) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PERSONAL_API_KEY}`
            },
            body: JSON.stringify({
                task: 'dokumenty',
                apikey: process.env.PERSONAL_API_KEY,
                answer: metadata
            })
        });

        return await response.json();
    } catch (error) {
        console.error('Error sending report:', error);
        throw error;
    }
}

main();
