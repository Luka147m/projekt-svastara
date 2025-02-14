import csv
import os
import json

def process_file(input_file):
    # Initialize an array to store the processed data
    processed_data = []

    try:
        # Open the file and read it line by line
        with open(input_file, 'r') as file:
            reader = csv.reader(file)
            for line in reader:
                # Ensure the line has enough elements to avoid index errors
                if len(line) >= 3:
                    try:
                        # Convert the 2nd and 3rd items to float and store them as a pair in the array
                        processed_data.append([float(line[2]), float(line[1])])
                    except ValueError:
                        # If conversion fails, print an error message and skip that line
                        print(f"Skipping line: {line} due to invalid float conversion.")
                        continue

        # Replace the input file with the processed array in JSON format
        with open(input_file, 'w') as file:
            json.dump(processed_data, file, indent=4)
        
        print(f"File processed and replaced with the resulting array.")
    except Exception as e:
        print(f"Error processing file: {e}")

# Example usage
if __name__ == "__main__":
    input_file = "C:\\Users\\lukam\\Documents\\Faks\\seminari\\proba\\test.txt"  # Hardcode path for testing

    if os.path.exists(input_file):
        process_file(input_file)
    else:
        print("The specified file does not exist.")
