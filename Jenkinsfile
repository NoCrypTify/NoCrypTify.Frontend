pipeline {
  agent any

  tools {
    nodejs 'NodeJS-20' 
  }

  environment {
    IMAGE_NAME = 'nocryptify_frontend'
    NGINX_CONF_DIR = '/home/ubuntu/secret-notes/nginx'
    VITE_POSTHOG_HOST = 'https://eu.i.posthog.com'

    STAGING_EC2_USER = "${env.STAGING_EC2_USER}"
    STAGING_EC2_HOST = "${env.EC2_HOST}"
    STAGING_URL      = "${env.STAGING_URL}"
    VITE_API_URL     = "${env.VITE_API_URL}"

    DOCKERHUB_CREDENTIALS = credentials('dockerhub')
    SONAR_TOKEN = credentials('sonarqube-token')
    SNYK_TOKEN = credentials('snyk-token')
    DISCORD_WEBHOOK = credentials('discord-webhook-url')
    VITE_POSTHOG_KEY  = credentials('POSTHOG_PROJECT_KEY')

    SCANNER_HOME = tool 'SonarScanner'
  }

  stages {
    stage('Lint') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN"'
        sh 'npx snyk test --severity-threshold=high || true'
        sh 'npx snyk monitor --project-name="${IMAGE_NAME}" || true'
        sh '"$SCANNER_HOME/bin/sonar-scanner" -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.token="$SONAR_TOKEN"'
      }
    }

    stage('Test') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'docker run --rm -u root -v "${WORKSPACE}:/work" -w /work node:20 rm -rf node_modules || true'

        sh 'npm ci'
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh """docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} \\
            --build-arg VITE_API_URL=${VITE_API_URL} \\
            --build-arg VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY} \\
            --build-arg VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST} ."""
      }
    }

    stage('Deliver') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sh '''
          echo "$DOCKERHUB_CREDENTIALS_PSW" | docker login -u "$DOCKERHUB_CREDENTIALS_USR" --password-stdin
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
        '''
      }
    }

    stage('Deploy to Staging') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            PROD_COLOR=$(ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "cat /home/ubuntu/secret-notes/frontend-prod.colour 2>/dev/null || echo 'blue'")

            if [ "$PROD_COLOR" = "blue" ]; then
              TARGET_ENV="frontend-green"
              TARGET_PORT=3001
            else
              TARGET_ENV="frontend-blue"
              TARGET_PORT=3000
            fi

            echo "Production ist aktuell: $PROD_COLOR. Deploye neue Version auf Staging: $TARGET_ENV..."

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              docker login -u $DOCKERHUB_CREDENTIALS_USR -p $DOCKERHUB_CREDENTIALS_PSW
              docker pull $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
              
              docker stop $TARGET_ENV || true
              docker rm $TARGET_ENV || true
              
              docker run -d \\
                --name $TARGET_ENV \\
                -p $TARGET_PORT:80 \\
                --network network \\
                --restart unless-stopped \\
                $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
            "
          '''
        }
      }
    }

    stage('E2E & Switch Traffic') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sh '''
          set -e
          
          # Wir nutzen nun /staging statt des direkten Ports!
          TEST_URL="http://$STAGING_EC2_HOST/staging"
          echo "Running Playwright E2E against $TEST_URL"

          docker run --rm -u root -v "${WORKSPACE}:/work" -w /work node:20 rm -rf test-results playwright-report || true
          
          docker run --rm \
            --user $(id -u):$(id -g) \
            -e HOME=/work \
            -v "${WORKSPACE}:/work" \
            -w /work \
            -e E2E_BASE_URL="$TEST_URL" \
            -e STAGING_URL="$TEST_URL" \
            -e VITE_POSTHOG_KEY="$VITE_POSTHOG_KEY" \
            mcr.microsoft.com/playwright:v1.61.1-jammy \
            /bin/bash -c "npm ci && npm run test:e2e"
        '''

        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            echo "Tests successful! Swapping config on host and reloading NGINX proxy..."

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST << 'EOF'
              
              COLOR_FILE="/home/ubuntu/secret-notes/frontend-prod.colour"
              CONF_FILE="/home/ubuntu/secret-notes/nginx/targets/frontend.conf"
              
              mkdir -p /home/ubuntu/secret-notes/nginx/targets

              if [ -f "$COLOR_FILE" ]; then
                PROD_COLOR=$(cat "$COLOR_FILE")
              else
                PROD_COLOR="blue"
              fi

              if [ "$PROD_COLOR" = "blue" ]; then
                NEW_PROD="green"
                NEW_STAGING="blue"
              else
                NEW_PROD="blue"
                NEW_STAGING="green"
              fi

              echo "Umschalten: $NEW_PROD wird Production, $NEW_STAGING wird Staging."

              echo 'set $frontend_production http://frontend-'"$NEW_PROD"':80;' > "$CONF_FILE"
              echo 'set $frontend_staging http://frontend-'"$NEW_STAGING"':80;' >> "$CONF_FILE"
              
              echo "$NEW_PROD" > "$COLOR_FILE"

              docker exec proxy nginx -s reload
EOF
          '''
        }
        
        sh '''
          echo "Deployment successful! Tagging image as stable and pushing to DockerHub..."
          echo "$DOCKERHUB_CREDENTIALS_PSW" | docker login -u "$DOCKERHUB_CREDENTIALS_USR" --password-stdin
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:stable"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:stable"
        '''
      }
      post {
        always {
          junit testResults: 'playwright-report/results.xml', allowEmptyResults: true
          archiveArtifacts artifacts: 'playwright-report/**', allowEmptyArchive: true
        }
      }
    }
  }

  post {
    failure {
      node('') {
        sh '''
          if [ -n "$DISCORD_WEBHOOK" ]; then
            # 1. Leerzeichen ersetzen (kompatibel mit der Standard-Jenkins-Shell)
            ENCODED_JOB_NAME=$(echo "$JOB_NAME" | sed 's/ /%20/g')
            
            # 2. Den exakten Blue Ocean Link zusammenbauen
            BLUE_OCEAN_URL="http://100.59.245.13:8080/blue/organizations/jenkins/${ENCODED_JOB_NAME}/detail/${ENCODED_JOB_NAME}/${BUILD_NUMBER}/pipeline"
            
            # 3. An Discord senden
            curl -H "Content-Type: application/json" \
              -X POST \
              -d "{\\"content\\": \\"<@&1522970703245348995> ❌ **${JOB_NAME} #${BUILD_NUMBER}** failed!\\\\nDetails: ${BLUE_OCEAN_URL}\\"}" \
              "$DISCORD_WEBHOOK"
          fi
        '''
      }
    }
  }
}