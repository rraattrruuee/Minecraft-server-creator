# Roadmap d'Amélioration & Principes de Gestion Serveur (v0.2.6)

Voici les 10 principes et idées clés pour moderniser la gestion des serveurs et passer à une architecture 100% Dockerisée et automatisée.

## 1. Tout Conteneuriser (Principe Fondamental) 🐳

**Objectif**: Plus aucun processus Java ne tourne directement sur l'hôte.
**Action**: Chaque serveur Minecraft est un service Docker isolé.
**Avantages**: Isolation des ressources, sécurité, facilité de mise à jour, compatibilité multi-OS.

## 2. Déploiement via Docker Compose / Swarm

**Objectif**: Utiliser des fichiers déclaratifs (`docker-compose.yml`) pour chaque serveur.
**Action**: Le `manager.py` génère et pilote ces fichiers plutôt que des `subprocess.Popen`.
**Avantages**:Gestion des volumes, réseaux, et configuration en un seul fichier. Redémarrage automatique (`restart: unless-stopped`).

## 3. Orchestration et Scalabilité

**Objectif**: Préparer le terrain pour Docker Swarm.
**Action**: Utiliser des réseaux overlay chiffrés pour la communication entre serveurs (Proxy <-> Serveur).

## 4. Monitoring Unifié (Prometheus + Grafana) 📊

**Objectif**: Métriques standardisées via des sidecars ou plugins.
**Action**: Chaque conteneur expose ses métriques. Un Prometheus central les scrape.
**Avantages**: Alerting proactif (CPU, RAM, TPS) et dashboards visuels.

## 5. Gestion des Logs Centralisée

**Objectif**: Ne plus parser des fichiers textes manuellement.
**Action**: Utiliser le driver de logging Docker (json-file avec rotation) et potentiellement un stack ELK/Loki léger.
**Avantages**: Historique, recherche rapide, pas de disque plein à cause des logs.

## 6. Self-Healing (Auto-réparation) ❤️

**Objectif**: Si un serveur crash, il redémarre tout seul.
**Action**: Utiliser les Healthchecks Docker (`HEALTHCHECK CMD mc-health`) et les politiques de restart.
**Avantages**: Haute disponibilité sans intervention humaine.

## 7. Backups Automatisés et Rétention

**Objectif**: Sauvegardes fiables sans arrêt de service.
**Action**: Sidecar container qui backup le volume `/data` périodiquement (vers S3 ou local).

## 8. Configuration as Code (GitOps) 📜

**Objectif**: Versionner les configurations.
**Action**: Stocker les `config` dans un dépôt Git ou utiliser des variables d'environnement pour toute la conf.

## 9. Sécurité et Isolation Réseau 🔒

**Objectif**: Protéger les serveurs.
**Action**: Aucun port serveur exposé publiquement sauf via un Proxy (Velocity/BungeeCord). Utilisation d'utilisateurs non-root dans les conteneurs.

## 10. Standardisation des Images

**Objectif**: Ne pas réinventer la roue.
**Action**: Utiliser exclusivement l'image maintenue `itzg/minecraft-server` qui gère tous les types (Paper, Forge, Fabric...) via des variables d'environnement simples.

---

**État actuel**: Implémentation immediate des points 1, 2, 6 et 10 dans le code actuel.
