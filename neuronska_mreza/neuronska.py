import pandas as pd
import numpy as np
import psycopg2
from datetime import datetime, timedelta
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import tensorflow as tf
from tensorflow.keras import regularizers
from tensorflow.keras.callbacks import EarlyStopping
from dotenv import load_dotenv
import os
import matplotlib.pyplot as plt
import sys
import seaborn as sns


if len(sys.argv) < 2:
    print("Usage: python <file.py> <destination_folder>")
    sys.exit(1)

dest_folder = sys.argv[1]
#-----------------------------------------------------------------------------------------------------
# Db config
load_dotenv()
db_config = {
    'dbname': os.getenv("DB_NAME"),
    'user': os.getenv("DB_USER"),
    'password': os.getenv("DB_PASSWORD"),
    'host': os.getenv("DB_HOST"),
    'port': os.getenv("DB_PORT")
}

def fetch_data():
    conn = psycopg2.connect(**db_config)
    query = """
    SELECT route_id, current_stop_sequence, started_at, reported_delay, distance,
           weather_type, temperature, feels_like, pressure, humidity, wind_speed, snow, rain,
           current_speed, free_flow_speed, road_closure,
           finished_at
    FROM finished_trips
    """
    df = pd.read_sql(query, conn)
    conn.close()
    return df
#----------------------------------------------------------------------------------------------------
# Plot funkcije

def save_learning_curves(history, dest_folder):
    os.makedirs(dest_folder, exist_ok=True)
    
    # vrijednost funkcije gubitka, koliko su modelove predikcije netočne, manje bolje
    plt.figure(figsize=(10, 4))
    plt.plot(history.history['loss'], label='Train Loss')
    plt.plot(history.history['val_loss'], label='Val Loss')
    plt.title('Gubitak modela kroz epohe')
    plt.xlabel('Epoha')
    plt.ylabel('MSE gubitak')
    plt.legend()
    plt.grid(True)
    plt.savefig(os.path.join(dest_folder, "gubitak_epoha.png"))
    plt.close()
    
    # prosječna apsolutna pogreška između stvarnih i predviđenih vrijednosti
    plt.figure(figsize=(10, 4))
    plt.plot(history.history['mae'], label='Train MAE')
    plt.plot(history.history['val_mae'], label='Val MAE')
    plt.title('MAE modela kroz epohe')
    plt.xlabel('Epoha')
    plt.ylabel('Mean Absolute Error (sekunde)')
    plt.legend()
    plt.grid(True)
    plt.savefig(os.path.join(dest_folder, "mae_epoha.png"))
    plt.close()

def save_speed_ratio_vs_duration(df, dest_folder):
    os.makedirs(dest_folder, exist_ok=True)
    
    plt.figure(figsize=(10, 5))
    plt.scatter(df["speed_ratio"], df["target"], alpha=0.5, color="orange")
    plt.title("Omjer brzine i trajanja puta")
    plt.xlabel("Omjer brzine (trenutna / slobodni protok)")
    plt.ylabel("Trajanje puta (sekunde)")
    plt.grid(True)
    plt.savefig(os.path.join(dest_folder, "brzina_trajanje.png"))
    plt.close()

def save_percentage_error_plot(y_pred, y_test, dest_folder):
    os.makedirs(dest_folder, exist_ok=True)
    
    percentage_errors = ((y_pred - y_test.values) / y_test.values) * 100
    plt.figure(figsize=(12, 6))
    plt.scatter(range(len(percentage_errors)), percentage_errors, color='blue', alpha=0.5, s=10)
    plt.axhline(0, color='red', linestyle='--', linewidth=1)
    plt.title("Postotna pogreška svakog testa")
    plt.xlabel("Indeks testa")
    plt.ylabel("Postotna pogreška (%)")
    plt.grid(True)
    plt.savefig(os.path.join(dest_folder, "postotna_pogreska.png"))
    plt.close()

def save_residual_histogram(y_pred, y_test, dest_folder):
    os.makedirs(dest_folder, exist_ok=True)

    residuals = y_pred - y_test.values
    plt.figure(figsize=(10, 5))
    plt.hist(residuals, bins=50, color='purple', alpha=0.7)
    plt.title("Histogram pogrešaka predikcija")
    plt.xlabel("Pogreška predikcije (sekunde)")
    plt.ylabel("Frekvencija")
    plt.grid(True)
    plt.savefig(os.path.join(dest_folder, "histogram.png"))
    plt.close()

def save_feature_correlation_heatmap(df, dest_folder):
    os.makedirs(dest_folder, exist_ok=True)

    numeric_df = df[["reported_delay", "distance",
                    "temperature", "feels_like", "pressure", "humidity", "wind_speed",
                    "snow", "rain", "speed_ratio", "target"]]

    numeric_df = numeric_df.rename(columns={
        "reported_delay": "Kašnjenje",
        "distance": "Udaljenost",
        "temperature": "Temperatura",
        "feels_like": "Osjećaj (temperatura)",
        "pressure": "Tlak",
        "humidity": "Vlažnost",
        "wind_speed": "Vjetar",
        "snow": "Snijeg",
        "rain": "Kiša",
        "speed_ratio": "Omjer brzine",
        "target": "Trajanje"
    })

    corr = numeric_df.corr()

    plt.figure(figsize=(10, 8))
    sns.heatmap(corr, annot=True, cmap='coolwarm', fmt=".2f")
    plt.title("Korelacijska matrica značajki")
    plt.tight_layout()
    plt.savefig(os.path.join(dest_folder, "korelacija_znacajki.png"))
    plt.close()

def save_predicted_vs_actual_plot(y_pred, y_test, dest_folder):
    os.makedirs(dest_folder, exist_ok=True)

    plt.figure(figsize=(8, 8))
    plt.scatter(y_test, y_pred, alpha=0.4, color='green')
    plt.plot([y_test.min(), y_test.max()], [y_test.min(), y_test.max()], 'r--')
    plt.title("Predviđeno i stvarno trajanje")
    plt.xlabel("Stvarno trajanje (sekunde)")
    plt.ylabel("Predviđeno trajanje (sekunde)")
    plt.grid(True)
    plt.savefig(os.path.join(dest_folder, "predvideno_stvarno.png"))
    plt.close()

def save_weather_correlation_plot(df, dest_folder):
    weather_columns = ["temperature", "feels_like", "pressure", "humidity", "wind_speed", "snow", "rain"]
    correlations = [df[col].corr(df["target"]) for col in weather_columns]

    plt.figure(figsize=(10, 6))
    plt.bar(weather_columns, correlations, color='skyblue')
    plt.xticks(rotation=45)
    plt.ylabel("Korelacija s trajanjem vožnje")
    plt.title("Korelacija vremenskih značajki i trajanja vožnje")
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(os.path.join(dest_folder, "vrijeme_korelacija.png"))
    plt.close()

def save_text_report(report_lines, dest_folder, filename="model_report.txt"):
    os.makedirs(dest_folder, exist_ok=True)
    with open(os.path.join(dest_folder, filename), "w", encoding="utf-8") as f:
        for line in report_lines:
            f.write(line + "\n")

#----------------------------------------------------------------------------------------------------
# Ulazni podaci
df = fetch_data()

# Target, razlika između stvarnog dolaska i stvarnog pocetka
df["started_at"] = pd.to_datetime(df["started_at"])
df["finished_at"] = pd.to_datetime(df["finished_at"])
df["target"] = (df["finished_at"] - df["started_at"]).dt.total_seconds()

# Prazni
df = df.dropna()

# Uzima se omjer brzine
df = df[df["free_flow_speed"] != 0]
df["speed_ratio"] = df["current_speed"] / df["free_flow_speed"]

started_at_series = df["started_at"].copy()
finished_at_series = df["finished_at"].copy()

df = df.drop(columns=["started_at", "finished_at"])


X = df.drop(columns=["target"])
y = df["target"]

# 75% train set, 25% test set
X_train, X_test, y_train, y_test, start_train, start_test, finish_train, finish_test = train_test_split(
    X, y, started_at_series, finished_at_series, test_size=0.25, random_state=42
)

numeric_features = [
    "current_stop_sequence", "reported_delay", "distance",
    "temperature", "feels_like", "pressure", "humidity", "wind_speed",
    "snow", "rain", "speed_ratio"
]
categorical_features = ["route_id", "weather_type", "road_closure"]

preprocessor = ColumnTransformer(transformers=[
    ("num", StandardScaler(), numeric_features),
    ("cat", OneHotEncoder(handle_unknown='ignore'), categorical_features)
])

pipeline = Pipeline(steps=[
    ("preprocessor", preprocessor)
])

X_train_processed = pipeline.fit_transform(X_train)
X_test_processed = pipeline.transform(X_test)


input_shape = X_train_processed.shape[1]

# # Mreža 64x32, sa reLu aktivacijskom funkcijom
# model = tf.keras.Sequential([
#     tf.keras.layers.Input(shape=(input_shape,)),
#     tf.keras.layers.Dense(64, activation='relu'),
#     tf.keras.layers.Dense(32, activation='relu'),
#     tf.keras.layers.Dense(1)
# ])

# Mreža 320x200x100x40x5
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(input_shape,)),
    tf.keras.layers.Dense(320, activation='relu'),
    tf.keras.layers.Dense(200, activation='relu'),
    tf.keras.layers.Dense(100, activation='relu'),
    tf.keras.layers.Dense(40, activation='relu'),
    tf.keras.layers.Dense(5, activation='relu'),
    tf.keras.layers.Dense(1)
])

# Regularizers penalizacija suma
# model = tf.keras.Sequential([
#     tf.keras.layers.Input(shape=(input_shape,)),
#     tf.keras.layers.Dense(128, activation='relu', kernel_regularizer=regularizers.l2(0.001)),
#     tf.keras.layers.Dropout(0.2),
#     tf.keras.layers.Dense(64, activation='relu', kernel_regularizer=regularizers.l2(0.001)),
#     tf.keras.layers.Dense(1)
# ])

model.compile(optimizer='adam', loss='mse', metrics=['mae'])

early_stopping = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)

history = model.fit(
    X_train_processed, y_train,
    validation_split=0.1,
    epochs=100,
    batch_size=32,
    callbacks=[early_stopping]
)

# history = model.fit(X_train_processed, y_train, validation_split=0.1, epochs=20, batch_size=32)

loss, mae = model.evaluate(X_test_processed, y_test)
# print(f"\nTest MAE: {mae:.2f} seconds")

y_pred = model.predict(X_test_processed).flatten()

report_lines = []

X_test_reset = X_test.reset_index(drop=True)
start_test_reset = start_test.reset_index(drop=True)

for i in range(10):
    route_id = X_test_reset.loc[i, "route_id"]
    stop_seq = X_test_reset.loc[i, "current_stop_sequence"]
    start_time = start_test_reset.loc[i]
    actual_arrival = finish_test.reset_index(drop=True).loc[i]
    predicted_seconds = float(y_pred[i])
    predicted_arrival = start_time + timedelta(seconds=predicted_seconds)

    report_lines.append(f"Tramvaj {route_id} započeo sa {stop_seq} stanice u {start_time.strftime('%H:%M:%S')}, "
          f"očekivano vrijeme dolaska na narednu stanicu {stop_seq + 1} je {predicted_arrival.strftime('%H:%M:%S')}, "
          f"stvarno vrijeme dolaska {actual_arrival}")
report_lines.append(f"\n")

report_lines.append(f"Training Loss (MSE): {history.history['loss'][-1]:.4f}")
report_lines.append(f"Validation Loss (MSE): {history.history['val_loss'][-1]:.4f}")
report_lines.append(f"Training MAE: {history.history['mae'][-1]:.4f} seconds")
report_lines.append(f"Validation MAE: {history.history['val_mae'][-1]:.4f} seconds\n")
report_lines.append(f"Test MAE: {mae:.2f} seconds\n")

absolute_errors = np.abs(y_pred - y_test)
time_margins = [10, 30, 60, 120]
for margin in time_margins:
    within_margin = np.sum(absolute_errors <= margin)
    percentage_within_margin = within_margin / len(absolute_errors) * 100
    line = f"Postotak predviđenih vremena dolaska unutar granice pogreške od ±{margin} sekundi: {percentage_within_margin:.2f}%"
    report_lines.append(line)

save_learning_curves(history, dest_folder)
save_speed_ratio_vs_duration(df, dest_folder)
save_percentage_error_plot(y_pred, y_test, dest_folder)
save_weather_correlation_plot(df, dest_folder)
save_predicted_vs_actual_plot( y_pred, y_test, dest_folder)
save_residual_histogram(y_pred, y_test, dest_folder)
save_learning_curves(history, dest_folder)
save_feature_correlation_heatmap(df,dest_folder)

save_text_report(report_lines, dest_folder)
