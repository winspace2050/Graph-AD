# Graph'AD — Outil de cartographie Active Directory
## Introduction

Graph'AD est un outil qui vous permet de visualiser et comprendre simplement les accès et la structure d'un annuaire Active Directory au sein d'une entreprise. Cet outil est censé s'adresser aussi bien aux techniciens qu'à des managers car contrairement à d'autres outil de cartographie d'Active Directory, celui-ci ne nécessite pas ou peu de connaissance technique.
## Stratégie de versionning
Les versions de Graph'AD sont formatés comme ainsi :
`{MAJEUR}.{MINEUR}.{PATCH}`

> MAJEUR : concerne des modifications majeures sur le code tel qu'une nouvelle architecture, une refonte UI ou la perte de rétrocompatibilité du code avec des versions précédentes de Graph'AD.

> MINEUR : concerne l'ajout de fonctionnalités tout en laissant la compatibilité intacte.

> PATCH : concerne la révision du code et la correction des lacunes du code (bugs, vulnérabilités, etc...)

## Prérequis

**Configuration minimale requise :**
- Windows Server 2012 / Windows 8
- WebView2 109
- Pour la collecte, un Active Directory fonctionnel


**Configuration recommandé :**
- Windows Server 2016+ / Windows 10 1709+
- WebView2 dernière version
- Pour la collecte, un Active Directory fonctionnel

> Graph'AD plantera si vous essayer d'exécuter l'application sur une version antérieur de Windows.
> A noter également qu'il vérifie automatiquement la présence d'Active Directory et vous averti s'il est manquant.
> WebView2 109 n'est plus pris en charge par Microsoft. Malgré la compatibilité minimale, il est recommandé d'exécuter l'application à partir de Windows Server 2016 qui supporte la dernière version de WebView2.
## Démarrage — première utilisation

**Étape 1 — Installer Graph'AD**

Récupérez l'exécutable `graphad.exe` présent dans les releases. Placez ce dernier, de préférence dans un dossier que vous le nommez comme bon vous semble, par exemple `GraphAD`. En effet, l'exécutable va créer 2 dossiers à côté de l'exécutable donc ne soyez pas surpris.

> ⚠️ Ne double-cliquez pas sur le fichier `.exe` — le démarrage se fait avec un certain privilège (voir ci-dessous).

---

**Étape 2 — Lancer Graph'AD**

1. Faites un clic droit sur le fichier `graphad.exe` puis choisissez  **"Exécuter en tant qu'administrateur"**.
2. Une fenêtre de confirmation peut apparaître — cliquez sur **Oui**. A noter que des identifiants / mots de passe Administrateur peuvent être demandés.
3. Vous arrivez alors sur la page d'accueil de Graph'AD. Vous n'avez pas d'archive pour l'instant. Dans la section "Nouvelle collecte". Saisissez deux fois une **phrase de passe** (12 caractères minimum). Cette phrase protège les données collectées depuis votre Active Directory.

> ⚠️ Retenez bien cette phrase — elle sera demandée à chaque fois que vous tentez de déchiffrer la collecte. Sans elle, les données récoltés ne peuvent pas être déchiffrées.

Cliquez ensuite sur "lancer la collecte". Cette opération peut prendre quelques secondes à plusieurs minutes selon la taille de votre annuaire.

---

**Étape 3 — Accéder à la collecte**

Une fois la collecte terminée, elle apparaît dans les collectes disponibles. Cliquez ensuite sur "ouvrir", saisissez la phrase de passe que vous aviez défini puis cliquez sur "Déchiffrer"...ou appuyez sur Entrée, ça fait la même chose.

Et hop, vous voilà arrivé sur la navigation entre chaque vue.
> Pour plus de précision, je vous invite à consulter la documentation disponible directement sur le menu burger. Sachez également que la documentation complète est disponible dans les sources pour une bonne prise en main.

Enfin, pour verrouiller proprement une archive, il suffit d'aller dans le menu burger puis de cliquer sur le bouton rouge "Verrouiller". Et voilà ! Vous revenez sur la page d'accueil.

## En cas de problème

Si un message d'erreur s'affiche au démarrage :

- Vérifiez que Graph'AD est bien ouvert **en tant qu'Administrateur**.
- Vérifiez que votre Active Directory est fonctionnelle.
- Sur des versions antérieurs à **Windows 8 / Windows Server 2012**, le script refusera de s'exécuter de toute façon.

Pour tout autre problème, consultez la documentation complète ou signalez
l'incident avec le message d'erreur exact et les logs disponibles dans
le dossier `logs\` de Graph'AD.

## Toute suggestion est bienvenue

Graph'AD est, à l'heure actuelle, un projet tout jeune. Mais, tout au long de sa vie, elle aura besoin de toute demande de suggestions que vous pouvez publier dans "issues". Toute contribution est également bienvenue pour aider à maintenir le projet en vie.

> **<font color="#ff0000">IMPORTANT</font>**: avant que j'oublie, si vous constatez des vulnérabilités, ne les signalez pas en public et ouvrez une conversation privée. Toute faille de sécurité ne doit pas être rendu public.
