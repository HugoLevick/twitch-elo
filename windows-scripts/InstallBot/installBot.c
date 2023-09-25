#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <io.h>
#include <windows.h>  // Include Windows.h for CopyFile function

int main() {
    // Check if the .env file exists in the source directory
    char dbPass[100];
    if (_access("C:\\Program Files\\twitch-elo\\.env", 0) != 0) {
        // Prompt the user for input data and variable names
        char twitchUser[100], addCustomBot[10], addCustomEmotes[10], botUsername[100], botPassword[150], hypeEmote[100], negativeEmote[100], sadEmote[100];

        printf("Enter your MySQL password: ");
        gets_s(dbPass, sizeof(dbPass));

        printf("Do you want to add a custom bot? (Y/N): ");
        gets_s(addCustomBot, sizeof(addCustomBot));

        if (_stricmp(addCustomBot, "Y") == 0 || _stricmp(addCustomBot, "Yes") == 0) {
            printf("Enter your Twitch bot username: ");
            gets_s(botUsername, sizeof(botUsername));

            printf("Enter your Twitch bot code: ");
            gets_s(botPassword, sizeof(botPassword));
        } else {
            // Set default values for bot credentials
            strcpy_s(botUsername, sizeof(botUsername), "tourneybot");
            strcpy_s(botPassword, sizeof(botPassword), "oauth:c013cz4hbrzxjwdepbpvzphxl5nl9a");
        }


        // Check if the directory exists, if not, create it
        if (_mkdir("C:\\Program Files\\twitch-elo") == 0) {
            printf("Directory created successfully.\n");
        }

        // Create the .env file with the user's input
        FILE* envFile = fopen("C:\\Program Files\\twitch-elo\\.env", "w");
        if (envFile != NULL) {
            fprintf(envFile, "PORT=5000\n");
            fprintf(envFile, "DB_HOST=localhost\n");
            fprintf(envFile, "DB_PORT=3306\n");
            fprintf(envFile, "DB_NAME=twitch_elo\n");
            fprintf(envFile, "DB_USERNAME=root\n");
            fprintf(envFile, "DB_PASSWORD=\"%s\"\n", dbPass);
            fprintf(envFile, "BOT_USERNAME=\"%s\"\n", botUsername);
            fprintf(envFile, "BOT_PASSWORD=\"%s\"\n", botPassword);
            fclose(envFile);
            printf(".env file created successfully.\n");
        } else {
            printf("Failed to create .env file.\n");
            system("pause");
            return 0;
        }
    }

    if (_access("C:\\Program Files\\twitch-elo\\options.json", 0) != 0) {
        FILE* optionsFile = fopen("C:\\Program Files\\twitch-elo\\options.json", "w");
        if (optionsFile != NULL) {
            fprintf(optionsFile, "{\"bottedChannel\":\"\",\"pickOrder\":\"ABBAAB\",\"playersPerTeam\":4,\"gameId\":null,\"cancelVoteTimeout\":180,\"cancelPickTimeout\":180,\"requireVotePhase\":true,\"stackMatches\":true}");
        } else {
            printf("Failed to create options file.\n");
            system("pause");
            return 0;
        }

    }    

    system("copy \"C:\\Program Files\\twitch-elo\\.env\" .");


    printf("Installing...\n");
    system("npm i --omit-dev");

    system("cls");
    system("call node CreateDatabase.js");

    printf("Installation complete.\n");

    // Pause before returning
    system("pause");
    return 1;
}
