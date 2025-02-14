import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout
from tensorflow.keras.optimizers import Adam

# Učitamo dataset
data = pd.read_csv('C:\\Users\\lukam\\Documents\\Faks\\seminari\\load\\data2.csv')

# Pretvorimo 'start_time' i 'end_time' u datetime format
data['start_time'] = pd.to_datetime(data['start_time'], format='%H:%M:%S')
data['end_time'] = pd.to_datetime(data['end_time'], format='%H:%M:%S')

# Pretvorimo ih u sekunde
data['start_time_seconds'] = data['start_time'].dt.hour * 3600 + data['start_time'].dt.minute * 60 + data['start_time'].dt.second
data['end_time_seconds'] = data['end_time'].dt.hour * 3600 + data['end_time'].dt.minute * 60 + data['end_time'].dt.second

# Ulazni podaci u mrežu su vrijeme u sekundama, normalizirana kašnjenja, brzina, zatvorene ceste, temperatura, vlaga, brzina vjetra i udaljenost
X = data[['start_time_seconds', 'normalized_delay', 'normalized_speed', 'road_closed', 
          'normalized_temperature', 'normalized_humidity', 'normalized_windspeed', 
          'normalized_distance']]

# Na izlazu mreže uspoređujemo predviđeno vrijeme dolaska i stvarno vrijeme dolaska
y = data['end_time_seconds']


scaler = MinMaxScaler()
X_scaled = scaler.fit_transform(X)

# Podijelimo podatke na trening i test set
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

# Naš model
model = Sequential()

# Mreža je sastavljena od tri sloja: ulaznog sloja s 64 neurona, skrivenog sloja s 32 neurona i izlaznog sloja s jednim neuronima
model.add(Dense(64, input_dim=X_train.shape[1], activation='relu'))
model.add(Dropout(0.2)) # Zbog overfittinga
model.add(Dense(32, activation='relu'))
model.add(Dense(1))

model.compile(optimizer=Adam(learning_rate=0.001), loss='mean_squared_error')

# Treniramo model
model.fit(X_train, y_train, epochs=50, batch_size=32, validation_data=(X_test, y_test))

# Evaluacija modela
loss = model.evaluate(X_test, y_test)
print("Test Loss:", loss)

# Predikcije
predictions = model.predict(X_test)
predicted_seconds = predictions.flatten()
predicted_times = [str(pd.to_timedelta(int(seconds), unit='s')) for seconds in predicted_seconds]

# Formatiramo vrijeme
predicted_times_formatted = [time.split()[2] for time in predicted_times]

print("\nPredictions (Input -> Predicted Output):")
for i in range(10):
    input_features = X_test[i]
    start_time = data.iloc[i]['start_time'].strftime('%H:%M:%S')
    input_features_str = ", ".join([f"{feat:.2f}" for feat in input_features])
    
    predicted_time = predicted_times_formatted[i]

    print(f"Start Time: {start_time} -> Input: {input_features_str} -> Predicted Time: {predicted_time}")
