import React, { useState, useEffect } from 'react';
import proj4 from 'proj4';
import * as XLSX from 'xlsx';
import { AlertCircle, Play, Info, X, Map } from 'lucide-react';

interface CoordinateData {
  ID: string | number;
  Latitude_DD: string;
  Longitude_DD: string;
  Easting: string;
  Northing: string;
  UTM_Zone: string;
}

function parseCoordinate(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return NaN;

  let str = String(val).trim().toUpperCase();
  
  // Pure number (DD)
  if (/^-?\d+(\.\d+)?$/.test(str)) {
      return parseFloat(str);
  }

  // Decimal degrees with direction (e.g. 108.5 E)
  const ddDirMatch = str.match(/^([\d.]+)\s*([NSEW])$/);
  if (ddDirMatch) {
      let dd = parseFloat(ddDirMatch[1]);
      const dir = ddDirMatch[2];
      if (dir === 'S' || dir === 'W') dd = -dd;
      return dd;
  }

  // DMS formatting. E.g., -2° 15' 30.5" S or 2 15 30 S
  const regex = /^(-?\d+)[^\d.]+?(\d+)[^\d.]+?([\d.]+)[^\dNSEW]*([NSEW])?$/i;
  const match = str.match(regex);

  if (match) {
      let deg = Math.abs(parseInt(match[1], 10));
      let min = parseInt(match[2], 10);
      let sec = parseFloat(match[3]);
      let dir = match[4];

      let isNegative = match[1].startsWith('-');
      let dd = deg + (min / 60) + (sec / 3600);

      if (dir === 'S' || dir === 'W' || isNegative) {
          dd = -dd;
      }
      return dd;
  }

  // Fallback
  return parseFloat(str);
}

export default function App() {
  const [jsonInput, setJsonInput] = useState('');
  const [convertedData, setConvertedData] = useState<CoordinateData[]>([]);
  const [error, setError] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [zoneMode, setZoneMode] = useState<'auto' | '48S'>('auto');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (typeof proj4 !== 'undefined' && typeof XLSX !== 'undefined') {
      setIsReady(true);
    }
  }, []);

  const loadExample = () => {
    const example = [
      { id: 'RBM-01', lat: -2.750000, lon: 108.000000 },
      { id: 'RBM-02', lat: "-2° 45' 30\" S", lon: "108° 10' 15\" E" },
      { id: 'RBM-03', latitude: "-2 48 10", longitude: "108 12 00" },
      { id: 'RBM-04', lat: 3.583333, lon: 98.666667 } 
    ];
    setJsonInput(JSON.stringify(example, null, 2));
    setError('');
  };

  const processBulk = () => {
    setError('');
    const inputVal = jsonInput.trim();

    if (!inputVal) {
      setError('Error: Input JSON kosong!');
      return;
    }

    try {
      const data = JSON.parse(inputVal);

      if (!Array.isArray(data)) {
        setError('Error: Data harus berupa Array. Gunakan [ di awal dan ] di akhir.');
        return;
      }

      const newConvertedData = data.map((item: any, index: number) => {
        const rawLat = item.lat ?? item.latitude ?? item.y ?? item.Northing;
        const rawLon = item.lon ?? item.longitude ?? item.x ?? item.Easting;

        if (rawLat === undefined || rawLon === undefined) {
          throw new Error(`Data ke-${index + 1} tidak memiliki koordinat lintang/bujur (lat/lon).`);
        }

        const lat = parseCoordinate(rawLat);
        const lon = parseCoordinate(rawLon);

        if (isNaN(lat) || isNaN(lon)) {
           throw new Error(`Koordinat tidak valid pada data ke-${index + 1}: lat=${rawLat}, lon=${rawLon}`);
        }

        let z = zoneMode === '48S' ? 48 : Math.floor((lon + 180) / 6) + 1;
        let h = zoneMode === '48S' ? 'S' : (lat >= 0 ? 'N' : 'S');

        const projWgs = '+proj=longlat +datum=WGS84 +no_defs';
        const projUtm = `+proj=utm +zone=${z} ${h === 'S' ? '+south' : '+north'} +datum=WGS84 +units=m +no_defs`;

        const result = proj4(projWgs, projUtm, [lon, lat]);

        return {
          ID: item.id || `RBM-${String(index + 1).padStart(3, '0')}`,
          Latitude_DD: lat.toFixed(8),
          Longitude_DD: lon.toFixed(8),
          Easting: result[0].toFixed(2),
          Northing: result[1].toFixed(2),
          UTM_Zone: `${z}${h}`,
        };
      });

      setConvertedData(newConvertedData);
    } catch (e: any) {
      setError('Kesalahan JSON atau Proses: ' + e.message);
      console.error(e);
    }
  };

  const exportExcel = () => {
    const excelData = convertedData.map(row => ({
      "ID Referensi": row.ID,
      "Garis Lintang (°)": parseFloat(row.Latitude_DD),
      "Garis Bujur (°)": parseFloat(row.Longitude_DD),
      "UTM Easting (m)": parseFloat(row.Easting),
      "UTM Northing (m)": parseFloat(row.Northing),
      "Zona UTM": row.UTM_Zone
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hasil_Konversi_UTM');
    XLSX.writeFile(wb, 'Hasil_DMS_ke_UTM.xlsx');
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(convertedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hasil_konversi_utm.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setJsonInput('');
    setConvertedData([]);
    setError('');
  };

  return (
    <div className="h-screen w-full bg-[#0F1115] text-[#E6EDF3] font-sans grid grid-rows-[auto_1fr_1fr] md:grid-rows-[60px_1fr_280px] overflow-hidden">
      
      {/* Header section perfectly mirroring the target structure */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#2d333b] bg-[#161b22] shrink-0">
        <div className="flex items-center gap-4">
          <img 
            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRTog_1R9acZHj2Ci4EZuS2MKJOm2Lu5mz8ZQ&s" 
            alt="PT Rebinmas Jaya" 
            className="w-9 h-9 object-cover rounded bg-white shrink-0 p-0.5" 
          />
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight truncate hidden sm:flex items-center gap-2">
              Geo-Processor: WGS84 (DMS/Deg) ⇄ UTM
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded align-middle">
                v3.0.0
              </span>
            </h1>
            <h1 className="text-sm font-semibold tracking-tight truncate block sm:hidden">
              Geo-Processor
            </h1>
            <p className="text-[10px] text-[#8B949E] uppercase tracking-wider mt-0.5">
              Sistem oleh <span className="text-blue-400 font-bold">Atha Rizki P</span> - Staff IT PT Rebinmas Jaya
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {isReady ? (
            <div className="flex items-center gap-[6px] px-3 py-1 rounded-full text-[11px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="hidden sm:inline">Engine: </span>SIAP
            </div>
          ) : (
            <div className="flex items-center gap-[6px] px-3 py-1 rounded-full text-[11px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
              <AlertCircle className="w-3 h-3" />
              Loading...
            </div>
          )}
        </div>
      </header>

      {/* Main UI body section (cols 8 and 4) */}
      <main className="grid grid-cols-1 md:grid-cols-12 gap-0 border-b border-[#2d333b] overflow-hidden">
        
        {/* Editor buffer */}
        <div className="md:col-span-8 p-4 flex flex-col gap-3 bg-[#0d1117] h-full overflow-hidden">
          <div className="flex items-center justify-between shrink-0">
            <label className="text-xs font-semibold text-[#8B949E] uppercase tracking-widest">
              Buffer Input JSON (DMS/Derajat)
            </label>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowHelp(true)} 
                className="px-3 py-1 flex items-center gap-1 text-xs rounded bg-[#1A1D23] border border-[#2D333B] text-blue-400 font-bold hover:bg-[#30363d] transition-colors"
              >
                <Info className="w-3 h-3" /> Panduan Format
              </button>
              <button 
                onClick={clearAll} 
                className="px-3 py-1 text-xs rounded bg-[#1A1D23] border border-[#2D333B] text-[#E6EDF3] hover:bg-[#30363d] transition-colors"
              >
                Bersihkan
              </button>
            </div>
          </div>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            className="flex-1 p-4 rounded-md text-sm font-mono bg-[#0d1117] border border-[#2d333b] text-[#79c0ff] resize-none outline-none focus:border-blue-500 transition-colors"
            placeholder="[\n  { \n    &#34;id&#34;: &#34;RBM-01&#34;, \n    &#34;lat&#34;: &#34;-2° 45' 30\&#34; S&#34;, \n    &#34;lon&#34;: &#34;108° 10' 15\&#34; E&#34;\n  }\n]"
          />
        </div>

        {/* Operating controls panel */}
        <div className="md:col-span-4 p-4 bg-[#161b22] border-t md:border-t-0 md:border-l border-[#2d333b] flex flex-col overflow-y-auto">
          <div className="space-y-1 mb-6">
            <h3 className="text-xs font-bold uppercase text-[#8B949E]">
              Panel Kontrol Operasi
            </h3>
            <p className="text-[11px] text-[#8b949e]">
              Konversi batch koordinat Geografis ke UTM menggunakan algoritma Proj4.
            </p>
          </div>

          <div className="space-y-4 mb-4">
            <div>
              <label className="text-[11px] font-semibold text-[#8B949E] block mb-2">TARGET ZONA UTM</label>
              <div className="flex bg-[#0d1117] p-1 rounded-md border border-[#2d333b]">
                <button 
                  onClick={() => setZoneMode('auto')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded ${zoneMode === 'auto' ? 'bg-blue-600 text-white' : 'text-[#8b949e] hover:text-white'}`}
                >
                  Otomatis (Auto)
                </button>
                <button 
                  onClick={() => setZoneMode('48S')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded ${zoneMode === '48S' ? 'bg-blue-600 text-white' : 'text-[#8b949e] hover:text-white'}`}
                >
                  WGS 48 S
                </button>
              </div>
            </div>
          </div>
          
          <button
            onClick={processBulk}
            className="w-full py-3 mt-4 rounded-md font-bold text-sm bg-blue-600 hover:bg-blue-500 shadow-lg flex items-center justify-center gap-2 text-white transition-colors"
          >
            <span>🚀</span> EKSEKUSI KONVERSI BATCH
          </button>
          
          <button
            onClick={loadExample}
            className="w-full py-2 mt-3 rounded-md font-semibold text-sm bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] text-[#E6EDF3] transition-colors"
          >
            Muat Skenario Contoh
          </button>
          
          <div className="mt-auto pt-6">
            {error ? (
              <div className="p-3 rounded border border-red-900/30 bg-red-900/10 text-red-400 text-[11px] font-mono whitespace-pre-wrap break-words">
                <div className="flex items-center gap-2 mb-1 font-bold">
                  <span className="text-lg leading-none">⚠</span> KONSOL LOG
                </div>
                {error}
              </div>
            ) : (
              <div className="p-3 rounded border border-[#2d333b] bg-[#161b22] text-[#8b949e] text-[11px] font-mono">
                <div className="flex items-center gap-2 mb-1 font-bold text-[#E6EDF3]">
                  <span className="text-lg leading-none text-blue-400">ℹ</span> STATUS SISTEM
                </div>
                [Sistem] Menunggu input JSON.<br />
                {isReady && '[Library] Komponen mesin aktif.'}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Output grid table */}
      <section className="bg-black overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#2d333b] bg-[#161b22] shrink-0">
          <h2 className="text-xs font-bold uppercase text-[#8B949E]">Aliran Data Output (UTM)</h2>
          <div className="flex gap-2">
            <button
              onClick={exportExcel}
              disabled={convertedData.length === 0}
              className="bg-green-600/20 text-green-400 border border-green-600/30 px-3 py-1 rounded text-[10px] font-bold uppercase hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Ekspor Excel
            </button>
            <button
              onClick={exportJSON}
              disabled={convertedData.length === 0}
              className="bg-gray-700/50 text-white px-3 py-1 rounded text-[10px] font-bold uppercase hover:bg-gray-600 border border-[#30363d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Ekspor JSON
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto bg-[#0d1117] relative">
          {convertedData.length > 0 ? (
            <table className="w-full border-collapse">
              <thead className="bg-[#1A1D23] sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 text-left text-[11px] uppercase tracking-[0.05em] text-[#8B949E] border-b border-[#2D333B]">ID Referensi</th>
                  <th className="p-2.5 text-left text-[11px] uppercase tracking-[0.05em] text-[#8B949E] border-b border-[#2D333B]">Garis Lintang (Lat)</th>
                  <th className="p-2.5 text-left text-[11px] uppercase tracking-[0.05em] text-[#8B949E] border-b border-[#2D333B]">Garis Bujur (Lon)</th>
                  <th className="p-2.5 text-left text-[11px] uppercase tracking-[0.05em] text-blue-400 border-b border-[#2D333B]">UTM Easting (X)</th>
                  <th className="p-2.5 text-left text-[11px] uppercase tracking-[0.05em] text-blue-400 border-b border-[#2D333B]">UTM Northing (Y)</th>
                  <th className="p-2.5 text-left text-[11px] uppercase tracking-[0.05em] text-blue-400 border-b border-[#2D333B]">Zona UTM</th>
                  <th className="p-2.5 text-center text-[11px] uppercase tracking-[0.05em] text-[#8B949E] border-b border-[#2D333B]">Cek Satelit</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {convertedData.map((row, idx) => (
                  <tr key={idx} className={`border-b border-[#21262d] ${idx % 2 === 1 ? 'bg-[#161b22]/30' : ''}`}>
                    <td className="px-[10px] py-[8px] text-[#E6EDF3]">{row.ID}</td>
                    <td className="px-[10px] py-[8px] text-[#E6EDF3]">{row.Latitude_DD} <span className="text-[#8B949E]">°</span></td>
                    <td className="px-[10px] py-[8px] text-[#E6EDF3]">{row.Longitude_DD} <span className="text-[#8B949E]">°</span></td>
                    <td className="px-[10px] py-[8px] text-blue-400 font-bold">{row.Easting} <span className="text-blue-400/60 font-normal text-[10px]">m</span></td>
                    <td className="px-[10px] py-[8px] text-blue-400 font-bold">{row.Northing} <span className="text-blue-400/60 font-normal text-[10px]">m</span></td>
                    <td className="px-[10px] py-[8px] text-blue-400 font-bold">{row.UTM_Zone}</td>
                    <td className="px-[10px] py-[8px] text-center">
                      <a 
                        href={`https://www.google.com/maps?t=k&q=${row.Latitude_DD},${row.Longitude_DD}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-[#238636]/10 text-[#3fb950] hover:bg-[#238636]/20 rounded border border-[#238636]/20 transition-colors"
                        title="Lihat di Citra Satelit (Google Maps)"
                      >
                        <Map className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold">PETA</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
             <div className="absolute inset-0 flex items-center justify-center text-[#8B949E] font-mono text-xs pointer-events-none">
              Menunggu aliran data...
            </div>
          )}
        </div>
      </section>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#2d333b] rounded-lg max-w-2xl w-full flex flex-col shadow-2xl max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-[#2d333b]">
              <h3 className="font-bold text-[#E6EDF3] flex items-center gap-2">
                <Info className="text-blue-400 w-5 h-5" /> Panduan Format JSON & Koordinat
              </h3>
              <button onClick={() => setShowHelp(false)} className="text-[#8B949E] hover:text-[#E6EDF3] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-[#8B949E] space-y-6">
              <p>
                Sistem ini menerima input berformat <strong>JSON Array</strong>. Anda dapat memuat daftar titik dalam jumlah banyak sekaligus.
              </p>
              
              <div>
                <h4 className="font-bold text-[#E6EDF3] mb-2 uppercase tracking-wider text-xs">1. Kolom Key JSON</h4>
                <p className="mb-2">Gunakan penamaan kolom (key) berikut pada properti JSON Anda:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Latitude:</strong> <code className="text-[#79c0ff]">lat</code>, <code className="text-[#79c0ff]">latitude</code>, atau <code className="text-[#79c0ff]">y</code></li>
                  <li><strong>Longitude:</strong> <code className="text-[#79c0ff]">lon</code>, <code className="text-[#79c0ff]">longitude</code>, atau <code className="text-[#79c0ff]">x</code></li>
                  <li><strong>ID Titik:</strong> <code className="text-[#79c0ff]">id</code> (Opsional)</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-[#E6EDF3] mb-2 uppercase tracking-wider text-xs">2. Format Penulisan Koordinat (Value)</h4>
                <p className="mb-2">Sistem cerdas di belakang kami dapat membaca berbagai ragam penulisan koordinat geografis:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-[#0d1117] border border-[#2d333b] p-3 rounded">
                    <div className="font-semibold text-[#E6EDF3] text-xs mb-1">Decimal Degrees (DD)</div>
                    <code className="text-[#79c0ff]">-2.750000</code>
                  </div>
                  <div className="bg-[#0d1117] border border-[#2d333b] p-3 rounded">
                    <div className="font-semibold text-[#E6EDF3] text-xs mb-1">Desimal + Arah (N/S/E/W)</div>
                    <code className="text-[#79c0ff]">2.75 S</code> atau <code className="text-[#79c0ff]">108.5 E</code>
                  </div>
                  <div className="bg-[#0d1117] border border-[#2d333b] p-3 rounded">
                    <div className="font-semibold text-[#E6EDF3] text-xs mb-1">DMS Lengkap (Simbol)</div>
                    <code className="text-[#79c0ff]">-2° 45' 30" S</code>
                  </div>
                  <div className="bg-[#0d1117] border border-[#2d333b] p-3 rounded">
                    <div className="font-semibold text-[#E6EDF3] text-xs mb-1">DMS Ringkas (Spasi)</div>
                    <code className="text-[#79c0ff]">-2 45 30</code> atau <code className="text-[#79c0ff]">2 48 10 S</code>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-[#E6EDF3] mb-2 uppercase tracking-wider text-xs">3. Contoh Struktur JSON Lengkap</h4>
                <pre className="bg-[#0d1117] p-4 rounded border border-[#2d333b] text-[#79c0ff] font-mono text-xs overflow-x-auto">
{`[
  {
    "id": "RBM-01",
    "lat": -2.75,
    "lon": 108.0
  },
  {
    "id": "RBM-02",
    "lat": "-2° 45' 30\\" S",
    "lon": "108° 10' 15\\" E"
  }
]`}
                </pre>
              </div>
            </div>
            <div className="p-4 border-t border-[#2d333b] flex justify-end bg-[#161b22] rounded-b-lg shrink-0">
              <button onClick={() => setShowHelp(false)} className="px-5 py-2 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-500 transition-colors shadow-lg">
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

