import {
  defineAgent,
  ServerOptions,
  cli,
  JobContext,
  JobProcess,
  JobRequest,
  voice,
  llm,
  inference,
} from '@livekit/agents';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as silero from '@livekit/agents-plugin-silero';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_FILE = fileURLToPath(import.meta.url);
const AGENT_DIR = dirname(AGENT_FILE);
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR ?? join(AGENT_DIR, 'transcripts');
const SANTO_DOMINGO_WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=18.4861&longitude=-69.9312&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=America%2FSanto_Domingo&forecast_days=1';
const MDJB_ICAO = 'MDJB';
const MDJB_METAR_URL = `https://aviationweather.gov/api/data/metar?ids=${MDJB_ICAO}&format=json`;
const MDJB_TAF_URL = `https://aviationweather.gov/api/data/taf?ids=${MDJB_ICAO}&format=json`;

// ── Palabras clave de activación ─────────────────────────────────────────────
const WAKE_WORDS = ['doco', 'doko', 'docomo'];
const CLOSING_PHRASES = ['gracias', 'cambio y fuera'];
const MAX_LLM_CONTEXT_ITEMS = 8;

// ── Prompt del sistema ───────────────────────────────────────────────────────
const PROMPT_SISTEMA = `\
Eres DOCO, el asistente de inteligencia operacional de drones de CrecerLab.

## Función
Apoyas en tiempo real a los operadores con:
- Procedimientos pre-vuelo y post-vuelo
- Verificación de listas de chequeo de seguridad
- Alertas de espacio aéreo y condiciones climáticas
- Protocolos de emergencia y gestión de incidentes
- Cumplimiento normativo de operaciones UAV (drones)

## Herramientas
- Cuando el operador pregunte por el clima, viento, lluvia, temperatura o condiciones meteorológicas en Santo Domingo, usa la herramienta consultarClimaSantoDomingo antes de responder.
- La herramienta tambien devuelve METAR y TAF del Aeropuerto Internacional Dr. Joaquin Balaguer (MDJB). Integra esos reportes con el clima general antes de recomendar.
- Resume el clima en lenguaje operacional para drones: viento, rachas, lluvia, nubosidad, temperatura, METAR/TAF y una recomendación breve.

## Personalidad
- Profesional, directo y conciso
- Máximo 3 oraciones en operaciones activas
- En emergencias, prioriza la seguridad por encima de todo
- Si no tienes información suficiente, responde exactamente: "Verificando procedimiento"
- Usa terminología aeronáutica cuando corresponde

## Idioma
Siempre responde en español.
`;

// ── Subclase de Agent con detección de palabra clave ────────────────────────
class DOCOAgent extends voice.Agent {
  private activado = false;

  constructor(
    private readonly transcript: TranscriptRecorder,
    private readonly operatorName: string,
  ) {
    super({
      instructions: PROMPT_SISTEMA,
      tools: {
        consultarClimaSantoDomingo: llm.tool({
          description:
            'Consulta el clima actual en Santo Domingo y el METAR/TAF de MDJB para evaluar condiciones operacionales de drones.',
          execute: consultarClimaSantoDomingo,
        }),
      },
    });
  }

  // ── Detección de palabra clave "DOCO" ──────────────────────────────────
  override async onUserTurnCompleted(
    chatCtx: llm.ChatContext,
    newMessage: llm.ChatMessage,
  ): Promise<void> {
    const contenido = newMessage.textContent ?? '';
    const texto = normalizarTexto(contenido);
    console.log(`[Operador] ${contenido}`);
    this.transcript.recordTurn(this.operatorName, contenido);

    if (this.activado && esFraseDeCierre(texto)) {
      this.activado = false;
      console.log('[DOCO] Asistencia finalizada, volviendo a modo escucha');
      this.transcript.recordTurn('DOCO', 'DOCO en espera.');
      this.session.say('DOCO en espera.', {
        allowInterruptions: false,
        addToChatCtx: false,
      });
      throw new voice.StopResponse();
    }

    if (!this.activado) {
      if (mencionaDOCO(texto)) {
        this.activado = true;
        console.log('[DOCO] Activado');
        await this.optimizarContextoParaRespuesta(chatCtx);
        return;
      }
      // DOCO no fue nombrado — permanecer en silencio
      console.log('[DOCO] En espera (di "DOCO" para activarme)');
      throw new voice.StopResponse();
    }

    await this.optimizarContextoParaRespuesta(chatCtx);
  }

  private async optimizarContextoParaRespuesta(chatCtx: llm.ChatContext): Promise<void> {
    const itemsAntes = chatCtx.items.length;

    if (itemsAntes <= MAX_LLM_CONTEXT_ITEMS) return;

    chatCtx.truncate(MAX_LLM_CONTEXT_ITEMS);
    await this.updateChatCtx(chatCtx);
    console.log(`[DOCO] Contexto LLM recortado: ${itemsAntes} -> ${chatCtx.items.length} items`);
  }
}

// ── Definición del agente ────────────────────────────────────────────────────
export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad as silero.VAD;
    const roomName = ctx.room.name ?? ctx.job.room?.name ?? 'sala-livekit';
    const transcript = await TranscriptRecorder.create({
      roomName,
      agentName: 'DOCO',
    });
    let saludoEnviado = false;

    console.log(`[DOCO] Transcript: ${transcript.filePath}`);

    ctx.addShutdownCallback(async () => {
      await transcript.close();
    });

    ctx.addParticipantEntrypoint(async (_ctx: JobContext, participante: RoomParticipant) => {
      const participantName = nombreParticipante(participante);
      console.log(`[DOCO] Vinculando sesion con participante: ${participantName}`);

      const sesion = crearSesion(vad);
      const agente = new DOCOAgent(transcript, participantName);

      registrarLogsDeSesion(sesion, transcript);

      await sesion.start({
        agent: agente,
        room: ctx.room,
        inputOptions: {
          audioEnabled: true,
          textEnabled: true,
          participantIdentity: participante.identity,
          closeOnDisconnect: true,
        },
        outputOptions: {
          audioEnabled: true,
          transcriptionEnabled: true,
          syncTranscription: true,
        },
        record: false,
      });

      if (!saludoEnviado) {
        saludoEnviado = true;
        const saludo = sesion.say(
          'DOCO en línea. Sistema de operaciones de drones activo. Menciona mi nombre para comenzar.',
          {
            allowInterruptions: false,
          },
        );
        await saludo.waitForPlayout();
      }
    });

    await ctx.connect();
  },
});

function crearSesion(vad: silero.VAD): voice.AgentSession {
  return new voice.AgentSession({
    vad,

    // STT - LiveKit Inference para evitar el WebSocket directo de ElevenLabs.
    stt: new inference.STT({
      model: 'elevenlabs/scribe_v2_realtime',
      language: 'es',
    }),

    // LLM - LiveKit Inference. Anthropic no tiene plugin Node oficial en LiveKit.
    llm: new inference.LLM({
      model: 'openai/gpt-4.1-mini',
    }),

    // TTS - ElevenLabs Multilingual
    tts: new elevenlabs.TTS({
      model: 'eleven_multilingual_v2',
      language: 'es',
      voiceSettings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.2,
      },
      // Para usar una voz personalizada, pega el Voice ID aqui:
      // voiceId: 'TU_VOICE_ID_AQUI',
    }),

    userAwayTimeout: null,
    preemptiveGeneration: false,
    turnHandling: {
      preemptiveGeneration: {
        enabled: false,
      },
    },
  });
}

async function consultarClimaSantoDomingo(): Promise<string> {
  const [climaGeneral, metar, taf] = await Promise.all([
    consultarClimaGeneralSantoDomingo(),
    consultarReporteAviacion('METAR', MDJB_METAR_URL),
    consultarReporteAviacion('TAF', MDJB_TAF_URL),
  ]);

  return [
    climaGeneral,
    '',
    `Reporte aeronautico Aeropuerto Internacional Dr. Joaquin Balaguer (${MDJB_ICAO}):`,
    `- METAR: ${metar}`,
    `- TAF: ${taf}`,
    '',
    'Integra el METAR/TAF con el clima general y da una recomendacion operacional breve para drones.',
  ].join('\n');
}

async function consultarClimaGeneralSantoDomingo(): Promise<string> {
  try {
    const respuesta = await fetch(SANTO_DOMINGO_WEATHER_URL, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!respuesta.ok) {
      return `No pude consultar el clima en vivo de Santo Domingo. Open-Meteo respondio HTTP ${respuesta.status}.`;
    }

    const data = (await respuesta.json()) as OpenMeteoCurrentWeatherResponse;
    const actual = data.current;

    if (!actual) {
      return 'No pude consultar el clima en vivo de Santo Domingo. Open-Meteo no devolvio datos actuales.';
    }

    return [
      'Clima actual en Santo Domingo:',
      `- Hora local: ${actual.time ?? 'no disponible'}`,
      `- Condicion: ${descripcionCodigoClima(actual.weather_code)}`,
      `- Temperatura: ${formatearNumero(actual.temperature_2m)} C`,
      `- Sensacion termica: ${formatearNumero(actual.apparent_temperature)} C`,
      `- Humedad relativa: ${formatearNumero(actual.relative_humidity_2m)}%`,
      `- Viento: ${formatearNumero(actual.wind_speed_10m)} km/h desde ${formatearNumero(actual.wind_direction_10m)} grados`,
      `- Rachas: ${formatearNumero(actual.wind_gusts_10m)} km/h`,
      `- Lluvia/precipitacion: ${formatearNumero(actual.precipitation)} mm, lluvia ${formatearNumero(actual.rain)} mm`,
      `- Nubosidad: ${formatearNumero(actual.cloud_cover)}%`,
      'Da una recomendacion operacional breve para drones basada en estos datos.',
    ].join('\n');
  } catch (error) {
    console.error('[DOCO] Error consultando clima:', error);
    return 'No pude consultar el clima en vivo de Santo Domingo por un error de conexion.';
  }
}

async function consultarReporteAviacion(tipo: 'METAR' | 'TAF', url: string): Promise<string> {
  try {
    const respuesta = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'DOCO/1.0 operaciones-drones',
      },
    });

    if (respuesta.status === 204) {
      return `sin ${tipo} reciente disponible para ${MDJB_ICAO}`;
    }

    if (!respuesta.ok) {
      return `no disponible, Aviation Weather respondio HTTP ${respuesta.status}`;
    }

    const data = (await respuesta.json()) as AviationWeatherApiResponse;
    const rawReport = extraerReporteRaw(data, tipo);
    return rawReport ?? `sin ${tipo} reciente disponible para ${MDJB_ICAO}`;
  } catch (error) {
    console.error(`[DOCO] Error consultando ${tipo}:`, error);
    return `no disponible por error de conexion`;
  }
}

function registrarLogsDeSesion(sesion: voice.AgentSession, transcript: TranscriptRecorder): void {
  // ── Logs de estado ───────────────────────────────────────────────────
  sesion.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
    console.log(`[STT] ${ev.isFinal ? 'Final' : 'Parcial'}: ${ev.transcript}`);
  });

  sesion.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
    console.log(`[DOCO] Estado: ${ev.oldState} -> ${ev.newState}`);
  });

  sesion.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
    console.log(`[Operador] Estado: ${ev.oldState} -> ${ev.newState}`);
  });

  sesion.on(voice.AgentSessionEventTypes.Error, (ev) => {
    console.error('[DOCO] Error de pipeline:', ev.error);
  });

  sesion.on(voice.AgentSessionEventTypes.Close, (ev) => {
    console.log(`[DOCO] Sesion cerrada: ${ev.reason}`);
    if (ev.error) {
      console.error('[DOCO] Error al cerrar:', ev.error);
    }
  });

  sesion.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    if (ev.item.type === 'message' && ev.item.role === 'assistant') {
      transcript.recordTurn('DOCO', ev.item.textContent ?? '');
    }
  });
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function mencionaDOCO(texto: string): boolean {
  return WAKE_WORDS.some((wakeWord) => texto.includes(wakeWord));
}

function esFraseDeCierre(texto: string): boolean {
  return mencionaDOCO(texto) && CLOSING_PHRASES.some((frase) => texto.includes(frase));
}

function nombreParticipante(participante: { name?: string; identity: string }): string {
  return participante.name || participante.identity;
}

function nombreArchivoSeguro(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatearNumero(valor: number | undefined): string {
  if (typeof valor !== 'number' || Number.isNaN(valor)) return 'no disponible';
  return new Intl.NumberFormat('es-DO', {
    maximumFractionDigits: 1,
  }).format(valor);
}

function descripcionCodigoClima(codigo: number | undefined): string {
  switch (codigo) {
    case 0:
      return 'cielo despejado';
    case 1:
      return 'mayormente despejado';
    case 2:
      return 'parcialmente nublado';
    case 3:
      return 'nublado';
    case 45:
    case 48:
      return 'niebla';
    case 51:
    case 53:
    case 55:
      return 'llovizna';
    case 56:
    case 57:
      return 'llovizna helada';
    case 61:
    case 63:
    case 65:
      return 'lluvia';
    case 66:
    case 67:
      return 'lluvia helada';
    case 71:
    case 73:
    case 75:
      return 'nieve';
    case 77:
      return 'granos de nieve';
    case 80:
    case 81:
    case 82:
      return 'chubascos';
    case 85:
    case 86:
      return 'chubascos de nieve';
    case 95:
      return 'tormenta electrica';
    case 96:
    case 99:
      return 'tormenta electrica con granizo';
    default:
      return codigo === undefined ? 'no disponible' : `codigo meteorologico ${codigo}`;
  }
}

function extraerReporteRaw(data: AviationWeatherApiResponse, tipo: 'METAR' | 'TAF'): string | null {
  const primerReporte = Array.isArray(data) ? data[0] : data;
  if (!primerReporte || typeof primerReporte !== 'object') return null;

  const camposPreferidos =
    tipo === 'METAR'
      ? ['rawOb', 'raw_text', 'rawText', 'metar', 'raw']
      : ['rawTAF', 'rawTaf', 'raw_text', 'rawText', 'taf', 'raw'];

  for (const campo of camposPreferidos) {
    const valor = primerReporte[campo];
    if (typeof valor === 'string' && valor.trim()) {
      return valor.trim();
    }
  }

  return null;
}

type TranscriptRecorderOptions = {
  roomName: string;
  agentName: string;
};

type RoomParticipant = {
  identity: string;
  name?: string;
};

type OpenMeteoCurrentWeatherResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    rain?: number;
    weather_code?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
  };
};

type AviationWeatherReport = Record<string, unknown>;
type AviationWeatherApiResponse = AviationWeatherReport | AviationWeatherReport[];

class TranscriptRecorder {
  private pendingWrite: Promise<void> = Promise.resolve();

  private constructor(public readonly filePath: string) {}

  static async create(options: TranscriptRecorderOptions): Promise<TranscriptRecorder> {
    await mkdir(TRANSCRIPTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeRoomName = nombreArchivoSeguro(options.roomName) || 'room';
    const filePath = join(TRANSCRIPTS_DIR, `${safeRoomName}-${timestamp}.md`);
    const recorder = new TranscriptRecorder(filePath);

    await writeFile(
      filePath,
      [
        `# Transcript - ${options.roomName}`,
        '',
        `- Sala: ${options.roomName}`,
        `- Agente: ${options.agentName}`,
        `- Inicio: ${new Date().toISOString()}`,
        '',
        '## Conversacion',
        '',
      ].join('\n'),
      'utf8',
    );

    return recorder;
  }

  recordTurn(speaker: string, text: string): void {
    const cleanText = text.trim();
    if (!cleanText) return;

    const line = `- ${this.formatTimestamp(new Date())} - **${speaker}:** ${cleanText}\n`;
    this.pendingWrite = this.pendingWrite
      .then(() => appendFile(this.filePath, line, 'utf8'))
      .catch((error) => {
        console.error('[DOCO] No se pudo guardar el transcript:', error);
      });
  }

  async close(): Promise<void> {
    await this.pendingWrite;
    await appendFile(this.filePath, `\n_Fin: ${new Date().toISOString()}_\n`, 'utf8');
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
}

// ── Punto de entrada del worker ──────────────────────────────────────────────
cli.runApp(
  new ServerOptions({
    agent: AGENT_FILE,
    agentName: 'DOCO',
    requestFunc: async (job: JobRequest) => {
      await job.accept('DOCO');
    },
  }),
);
