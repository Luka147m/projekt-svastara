import psycopg2
import requests
import zipfile
import os
import sys
import argparse
from dotenv import load_dotenv

load_dotenv()

# Postgresql db parameters
db_params = {
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_DATABASE'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
}

# URL to ZET GTFS static data
zip_url = 'https://www.zet.hr/gtfs-scheduled/latest'

# Function to download the ZIP file
def download_zip(url, destination_folder):
    os.makedirs(destination_folder, exist_ok=True)
    response = requests.get(url)
    zip_path = os.path.join(destination_folder, 'latest.zip')
    
    if response.status_code == 200:
        with open(zip_path, 'wb') as file:
            file.write(response.content)
        print(f"ZIP file downloaded successfully to {zip_path}")
    else:
        print(f"Failed to download ZIP file. Status code: {response.status_code}")

# Function to extract the ZIP file
def unzip_file(folder_path):
    zip_path = os.path.join(folder_path, 'latest.zip')
    extract_path = os.path.join(folder_path, 'extracted_data')
    os.makedirs(extract_path, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_path)
    print(f"ZIP file extracted successfully to {extract_path}")
    return extract_path

# Function to execute SQL commands
def execute_sql(connection, cursor, sql):
    cursor.execute(sql)
    connection.commit()

# Function to load data from CSV to PostgreSQL
def load_csv_to_postgres(connection, cursor, file_path, table_name):
    try:
        # Drop existing data from the table
        drop_table_sql = f'TRUNCATE {table_name} CASCADE;'
        cursor.execute(drop_table_sql)
        connection.commit()
        
        # Use copy_expert to stream the file
        with open(file_path, 'r', encoding='utf-8',) as csv_file:
            copy_sql = f"COPY {table_name} FROM STDIN WITH CSV HEADER DELIMITER ','"
            cursor.copy_expert(copy_sql, csv_file)
        
        connection.commit()
        print(f"Loaded {table_name}")
    except Exception as e:
        connection.rollback()
        print(f"Error loading {table_name}: {e}")

def get_folder_path():
    # Check if folder path is passed as an argument or from environment variable
    folder_path = os.getenv('LOCAL_DESTINATION')
    if not folder_path:
        folder_path = args.folder
        if not folder_path:
            folder_path = input("Please provide the local destination folder path: ")
    return folder_path

if __name__ == "__main__":
    # Set up argparse to handle command-line arguments
    parser = argparse.ArgumentParser(description="Download and load GTFS data into PostgreSQL")
    parser.add_argument(
        '--folder', 
        type=str, 
        help="Path to the folder where the GTFS data will be stored (optional)"
    )
    parser.add_argument(
        '--zipfile', 
        type=str, 
        help="Path to the ZIP file containing GTFS data (optional)"
    )
    args = parser.parse_args()

    local_destination = get_folder_path()

    if not local_destination:
        print("Local destination not provided.")
        sys.exit(1)

    if args.zipfile:
        # Use the provided ZIP file
        zip_path = args.zipfile
        extract_path = os.path.join(local_destination, 'extracted_data')
        os.makedirs(extract_path, exist_ok=True)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_path)
        print(f"ZIP file extracted successfully to {extract_path}")
        extracted_data_path = extract_path
    else:
        # Download and unzip the data
        download_zip(zip_url, local_destination)
        extracted_data_path = unzip_file(local_destination)

    try:
        # Connect to PostgreSQL
        connection = psycopg2.connect(**db_params)
        cursor = connection.cursor()

        # Create tables if they do not exist
        create_table_commands = [
            """
            CREATE TABLE IF NOT EXISTS agency (
                agency_id INTEGER PRIMARY KEY,
                agency_name VARCHAR(255) NOT NULL,
                agency_url TEXT NOT NULL,
                agency_timezone VARCHAR(50) NOT NULL,
                agency_lang CHAR(2),
                agency_phone VARCHAR(20),
                agency_fare_url TEXT
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS calendar (
                service_id VARCHAR PRIMARY KEY,
                monday INT,
                tuesday INT,
                wednesday INT,
                thursday INT,
                friday INT,
                saturday INT,
                sunday INT,
                start_date INT,
                end_date INT -- Date format is YYYYMMDD in INTEGER
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS calendar_dates (
                service_id VARCHAR,
                exception_date INT, -- yyyymmdd
                exception_type INT
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS feed_info (
                feed_publisher_name VARCHAR(255),
                feed_publisher_url VARCHAR(255),
                feed_lang VARCHAR(2),
                feed_start_date INT,
                feed_end_date INT, -- yyyymmdd
                feed_version VARCHAR(50)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS routes (
                route_id INT PRIMARY KEY,
                agency_id INT,
                route_short_name VARCHAR(50),
                route_long_name VARCHAR(255),
                route_desc TEXT,
                route_type INT,
                route_url VARCHAR(255),
                route_color VARCHAR(10),
                route_text_color VARCHAR(10)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS shapes (
                shape_id VARCHAR(50),
                shape_pt_lat DOUBLE PRECISION,
                shape_pt_lon DOUBLE PRECISION,
                shape_pt_sequence INT,
                shape_dist_traveled DOUBLE PRECISION
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS stop_times (
                trip_id VARCHAR(255),
                arrival_time INTERVAL,
                departure_time INTERVAL,
                stop_id VARCHAR(25),
                stop_sequence INT,
                stop_headsign VARCHAR(255),
                pickup_type INT,
                drop_off_type INT,
                shape_dist_traveled DOUBLE PRECISION,
                PRIMARY KEY (trip_id, stop_sequence)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS stops (
                stop_id VARCHAR(50) PRIMARY KEY,
                stop_code VARCHAR(10),
                stop_name VARCHAR(255),
                stop_desc TEXT,
                stop_lat DOUBLE PRECISION,
                stop_lon DOUBLE PRECISION,
                zone_id VARCHAR(50),
                stop_url VARCHAR(255),
                location_type INT, 
                parent_station VARCHAR(50),
                FOREIGN KEY (parent_station) REFERENCES stops(stop_id)
            );
            """,
            """
            CREATE TABLE IF NOT EXISTS trips (
                route_id INT,
                service_id VARCHAR(50),
                trip_id VARCHAR(50),
                trip_headsign VARCHAR(255),
                trip_short_name VARCHAR(50),
                direction_id INT,
                block_id INT,
                shape_id INT,
                PRIMARY KEY (trip_id)
            );
            """
        ]
    

        for command in create_table_commands:
            execute_sql(connection, cursor, command)

        # Load data to each table
        table_file_mapping = {
            'agency': 'agency.txt',
            'calendar': 'calendar.txt',
            'calendar_dates': 'calendar_dates.txt',
            'feed_info': 'feed_info.txt',
            'routes': 'routes.txt',
            'shapes': 'shapes.txt',
            'stop_times': 'stop_times.txt',
            'stops': 'stops.txt',
            'trips': 'trips.txt',
        }

        for table_name, file_name in table_file_mapping.items():
            file_path = os.path.join(extracted_data_path, file_name)
            load_csv_to_postgres(connection, cursor, file_path, table_name)
        
    finally:
        # Close the cursor and connection
        if cursor:
            cursor.close()
        if connection:
            connection.close()
